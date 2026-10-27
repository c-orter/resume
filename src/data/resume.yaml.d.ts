// Types for resume.yaml. Strings in `description`-like fields are rendered with set:html.
declare const contents: {
  name: string
  title: string
  contacts: { icon: string; label: string; href: string; external?: boolean; printOnly?: boolean }[]
  education: { completed: string; degree: string; institution: string; gpa: string }[]
  experience: { position: string; period: string; company: string; description: string[] }[]
  projects: { name: string; technologies: string; description: string; github: string; npm: string }[]
  certifications: string[]
  skills: { category: string; items: string }[]
}

export = contents
