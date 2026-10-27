import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, type Browser, type Page } from 'playwright'
import { PNG } from 'pngjs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

// Run through `bun run test:print`, which builds first. Set UPDATE_PRINT_REFERENCE=1 to accept the current output.
const PORT = 4399
const BASE = `http://localhost:${PORT}/`
const REFERENCE = 'tests/__reference__/print-reference.pdf'
const OUT = 'test-results'
const TOLERANCE_PT = 1.5

// Started lazily and shared, closed once at the end.
let server: ReturnType<typeof Bun.serve> | undefined
let browser: Browser | undefined

async function getBrowser(): Promise<Browser> {
  mkdirSync(OUT, { recursive: true })
  server ??= Bun.serve({
    port: PORT,
    async fetch(req) {
      const path = new URL(req.url).pathname
      const file = Bun.file(`dist${path.endsWith('/') ? `${path}index.html` : path}`)
      return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 })
    },
  })
  return (browser ??= await chromium.launch())
}

afterAll(async () => {
  await browser?.close()
  await server?.stop(true)
})

async function open(opts: { dark: boolean; media: 'print' | 'screen' }): Promise<Page> {
  const page = await (await getBrowser()).newPage({ viewport: { width: 1200, height: 900 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), opts.dark)
  await page.emulateMedia({ media: opts.media })
  return page
}

type PrintSpy = { __printed: number }

const visible = (page: Page, selector: string) => page.locator(selector).first().isVisible()

// Light page text is dark; a leaked dark theme would flip this. Colours can be oklch(), so normalise to rgb via a canvas.
const luminance = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.fillStyle = getComputedStyle(el).color
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    })

// Mirrors Chrome's default print dialog on Letter: default margins, no background graphics.
const PRINT_OPTIONS = { format: 'Letter', margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' } } as const

async function inspect(data: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const page = await doc.getPage(1)

  // Text items are chunked differently between Chrome versions, so compare whole lines per column.
  const items = (await page.getTextContent()).items
    .filter((i): i is TextItem => 'str' in i && i.str.trim() !== '')
    .map((i) => ({ text: i.str, x: i.transform[4], y: i.transform[5] }))
    .sort((a, b) => b.y - a.y)
  const lines: { text: string; x: number; y: number }[] = []
  const leftColumn = 190
  for (const item of items) {
    const left = item.x < leftColumn
    const line = lines.find((l) => Math.abs(l.y - item.y) < 1 && l.x < leftColumn === left)
    if (line) {
      line.text += item.text
      line.x = Math.min(line.x, item.x)
    } else lines.push({ ...item })
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, '')
  lines.sort((a, b) => b.y - a.y || a.x - b.x)

  const ops = await page.getOperatorList()
  const colors = new Set<string>()
  let paths = 0
  ops.fnArray.forEach((fn, i) => {
    if (fn === pdfjs.OPS.constructPath) {
      // Only icon- and bullet-sized paths count: page clips and header-sized boxes (the wave) are not content.
      const [, , bounds] = ops.argsArray[i] as [unknown, unknown, ArrayLike<number> | null]
      if (bounds && bounds[2] - bounds[0] < 100) paths++
    }
    if (fn === pdfjs.OPS.setFillRGBColor) colors.add(String(ops.argsArray[i]))
  })
  // White fills are invisible on white paper (the old build painted one behind the header).
  colors.delete('#ffffff')
  return { pages: doc.numPages, lines, paths, colors: [...colors].sort() }
}

describe.each([false, true])('print (dark class set: %p)', (dark) => {
  const tag = dark ? 'dark' : 'light'

  test('hides screen-only chrome and shows print-only content', async () => {
    const page = await open({ dark, media: 'print' })
    expect(await page.locator('.header').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none')
    expect(await visible(page, '.toolbar')).toBe(false)
    expect(await visible(page, 'img')).toBe(false)
    expect(await visible(page, 'a[href="https://cartergrimmeisen.com"]')).toBe(true)
    expect(await visible(page, 'text=https://www.npmjs.com/package/zod-prisma')).toBe(true)
    expect(await visible(page, 'a[href$="/zod-prisma"] svg')).toBe(false)
    await page.close()
  })

  test('is always light, whatever the theme', async () => {
    const page = await open({ dark, media: 'print' })
    expect(await luminance(page, 'h1')).toBeLessThan(0.3)
    expect(await luminance(page, 'p')).toBeLessThan(0.4)
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe('rgba(0, 0, 0, 0)')
    await page.close()
  })

  test('prints like the reference PDF, with background graphics on or off', async () => {
    const page = await open({ dark, media: 'print' })
    const pdf = await page.pdf(PRINT_OPTIONS)
    const withBackgrounds = await page.pdf({ ...PRINT_OPTIONS, printBackground: true })
    writeFileSync(`${OUT}/print-${tag}.pdf`, pdf)
    await page.close()

    if (process.env.UPDATE_PRINT_REFERENCE && !dark) writeFileSync(REFERENCE, pdf)
    const [actual, expected] = await Promise.all([inspect(pdf), inspect(await Bun.file(REFERENCE).bytes())])

    // The header wave must not show, even with background graphics on: sample the area behind the name.
    const raster = Bun.spawnSync(['pdftoppm', '-png', '-r', '20', '-singlefile'], { stdin: withBackgrounds })
    const png = PNG.sync.read(Buffer.from(raster.stdout))
    const px = (x: number, y: number) => [...png.data.slice((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)]
    expect(px(Math.round(png.width * 0.1), Math.round(png.height * 0.04))).toEqual([255, 255, 255])
    // Colours legitimately differ (Chrome darkens text without backgrounds), but nothing may be drawn extra, like the header wave.
    const { colors: _, ...withBackgroundsShape } = await inspect(withBackgrounds)
    expect(withBackgroundsShape).toEqual({ pages: 1, lines: actual.lines, paths: actual.paths })
    expect(actual.pages).toBe(1)
    expect(actual.pages).toBe(expected.pages)
    // Icons and bullets: a missing icon, or a bullet drawn as a CSS background, changes this.
    expect(actual.paths).toBe(expected.paths)
    expect(actual.colors).toEqual(expected.colors)
    expect(actual.lines.map((l) => l.text)).toEqual(expected.lines.map((l) => l.text))
    actual.lines.forEach((line, i) => {
      expect(Math.abs(line.x - expected.lines[i].x)).toBeLessThan(TOLERANCE_PT)
      expect(Math.abs(line.y - expected.lines[i].y)).toBeLessThan(TOLERANCE_PT)
    })
  })
})

describe('screen', () => {
  test('theme toggle flips the class and persists', async () => {
    const page = await open({ dark: false, media: 'screen' })
    await page.evaluate(() => localStorage.removeItem('vueuse-color-scheme'))
    await page.click('#theme-button')
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
    await page.reload()
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
    await page.click('#theme-button')
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
    await page.close()
  })

  test('print button opens the print dialog', async () => {
    const page = await open({ dark: false, media: 'screen' })
    await page.evaluate(() => {
      ;(window as unknown as PrintSpy).__printed = 0
      window.print = () => void (window as unknown as PrintSpy).__printed++
    })
    await page.click('#print-button')
    expect(await page.evaluate(() => (window as unknown as PrintSpy).__printed)).toBe(1)
    await page.close()
  })
})
