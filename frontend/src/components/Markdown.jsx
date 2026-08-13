import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Models answer in markdown whether or not anything renders it, so leaving it
// unrendered meant reading raw `**bold**` and `- ` bullets. The visual styling
// lives in index.css under `.md-body`; the overrides here are behavioural.
//
// react-markdown builds React elements rather than setting innerHTML, and raw
// HTML in a response is escaped unless a plugin opts into it — which nothing
// here does. Model output is untrusted text and is treated as such.
const components = {
  // Model-supplied links are untrusted: open them in a new tab and deny the
  // opened page any handle back on this one.
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),

  // A wide table must scroll inside the bubble rather than stretching it.
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto scrollbar-subtle">
      <table {...props}>{children}</table>
    </div>
  ),

  pre: ({ children, ...props }) => (
    <pre {...props} className="scrollbar-subtle">
      {children}
    </pre>
  ),
}

function Markdown({ content }) {
  return (
    <div className="md-body break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Re-render only when the text actually changes. Every streamed token
// re-renders the whole thread, and re-parsing every sibling message each time
// is wasted work.
export default memo(Markdown)
