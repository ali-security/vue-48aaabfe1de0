import { parseHTML } from 'compiler/parser/html-parser'
import { extend } from 'shared/util'
import { baseOptions } from 'web/compiler/options'

// Records the exact callback sequence produced by parseHTML so that the
// plain text element (script/style/textarea) branch can be pinned down
// precisely, including the index bookkeeping it hands to `end`.
function record(html: string): any[] {
  const calls: any[] = []
  parseHTML(
    html,
    extend(
      {
        start: (tag, attrs, unary, start, end) =>
          calls.push(['start', tag, unary, start, end]),
        end: (tag, start, end) => calls.push(['end', tag, start, end]),
        chars: (text, start, end) => calls.push(['chars', text, start, end]),
        comment: (text, start, end) => calls.push(['comment', text, start, end])
      },
      baseOptions
    ) as any
  )
  return calls
}

function noop() {}

const silentOptions = {
  start: noop,
  end: noop,
  chars: noop,
  comment: noop
} as any

describe('parseHTML', () => {
  it('closes a plain text element on its end tag', () => {
    expect(record('<script>let a = 1 < 2</script>')).toEqual([
      ['start', 'script', false, 0, 8],
      ['chars', 'let a = 1 < 2', undefined, undefined],
      ['end', 'script', 21, 30]
    ])
  })

  it('closes a plain text element on a mixed case end tag', () => {
    expect(record('<div><textarea>hello</TEXTAREA></div>')).toEqual([
      ['start', 'div', false, 0, 5],
      ['start', 'textarea', false, 5, 15],
      ['chars', 'hello', undefined, undefined],
      ['end', 'textarea', 20, 31],
      ['end', 'div', 31, 37]
    ])
  })

  it('allows whitespace and attributes in a plain text end tag', () => {
    expect(record('<textarea>hi</textarea >')).toEqual([
      ['start', 'textarea', false, 0, 10],
      ['chars', 'hi', undefined, undefined],
      ['end', 'textarea', 12, 24]
    ])

    // `[^>]*>` also swallows trailing garbage, keep that behaviour
    expect(record('<script>a</scriptx>b')).toEqual([
      ['start', 'script', false, 0, 8],
      ['chars', 'a', undefined, undefined],
      ['end', 'script', 9, 19],
      ['chars', 'b', 19, 20]
    ])
  })

  it('skips end tags of other elements inside a plain text element', () => {
    expect(record('<script>a</div>b</script>c')).toEqual([
      ['start', 'script', false, 0, 8],
      ['chars', 'a</div>b', undefined, undefined],
      ['end', 'script', 16, 25],
      ['chars', 'c', 25, 26]
    ])
  })

  it('treats an unclosed plain text element as text', () => {
    expect(record('<div>Hello, world!<script><</textarea></div>')).toEqual([
      ['start', 'div', false, 0, 5],
      ['chars', 'Hello, world!', 5, 18],
      ['start', 'script', false, 18, 26],
      ['end', 'script', 26, 26],
      ['chars', '<</textarea></div>', undefined, undefined],
      ['end', 'div', 26, 26]
    ])
  })

  it('treats a truncated end tag as text', () => {
    // `</script` with no `>` never closes the element
    expect(record('<script>foo</script')).toEqual([
      ['start', 'script', false, 0, 8],
      ['end', 'script', 8, 8],
      ['chars', 'foo</script', undefined, undefined]
    ])
  })

  // CVE-2024-9506: the end tag of a plain text element used to be located with
  // /([\s\S]*?)(<\/tag[^>]*>)/i. The leading lazy group makes the engine
  // re-scan the remainder of the template from every offset, so an element
  // that is never closed costs quadratic time. This is the advisory's PoC.
  it('parses an unclosed plain text element in linear time (CVE-2024-9506)', () => {
    const payload = `<div>Hello, world!<script>${'<'.repeat(
      1000000
    )}</textarea></div>`
    const start = Date.now()
    parseHTML(payload, silentOptions)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('parses an unclosed <textarea> in linear time (CVE-2024-9506)', () => {
    const payload = `<div><textarea>${'<'.repeat(1000000)}</script></div>`
    const start = Date.now()
    parseHTML(payload, silentOptions)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('parses an unclosed <style> in linear time (CVE-2024-9506)', () => {
    const payload = `<div><style>${'<'.repeat(1000000)}</script></div>`
    const start = Date.now()
    parseHTML(payload, silentOptions)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('parses a truncated end tag in linear time (CVE-2024-9506)', () => {
    // `</script` repeated with no `>` in sight: every offset looks like a
    // candidate end tag to the old regex
    const payload = `<div><script>${'</script'.repeat(125000)}`
    const start = Date.now()
    parseHTML(payload, silentOptions)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
