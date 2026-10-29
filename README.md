# My Resume

Can be viewed publicly at https://cartergrimmeisen.com

Built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com) and [Bun](https://bun.sh).
Content lives in [`src/data/resume.yaml`](src/data/resume.yaml). `/` is the one-page resume; `/full` is the two-page version, which adds every `full:` entry (extra bullets and skills) from the YAML.

## Commands

| Command                | Does                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `bun install`          | Install dependencies                                                                                                              |
| `bun dev`              | Dev server on http://localhost:3333                                                                                               |
| `bun run build`        | Build to `dist/`                                                                                                                  |
| `bun fmt` / `bun lint` | Format / lint with Bun's built-in tools (`bun lint` needs a Bun build that includes it, currently canary: `bun upgrade --canary`) |
| `bun run check`        | Type-check `.astro` and `.ts` files                                                                                               |
| `bun run test:print`   | Build, then test print output (see below)                                                                                         |

## Print mode

Printing is a first-class feature. Dark styles never apply in print (the `dark:` variant is
guarded with `@media not print` in `src/styles/global.css`), so any way of printing is light.

`bun run test:print` prints the built site to PDF in Chromium (Letter, default margins), with and without the
dark class and with background graphics on and off, and compares each version (`/` must be one page, `/full` two) to a browser print kept in
`tests/__reference__/`: same page count, same text lines at the same positions (1.5pt tolerance), same
icon/bullet vector graphics, same colours, and no header wave. It also checks that screen-only chrome is hidden and
print-only links show. The generated PDFs land in `test-results/`; open one to eyeball it.

To accept an intentional change, print the page from your browser and replace the reference PDF, or run
`UPDATE_PRINT_REFERENCE=1 bun run test:print`. First run needs `bunx playwright install chromium` and `pdftoppm`
(poppler).
