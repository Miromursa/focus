import { describe, expect, it } from 'vitest'
import de from './de.json'
import en from './en.json'

type Tree = { [k: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out.set(prefix + k, v)
    else for (const [kk, vv] of flatten(v, `${prefix}${k}.`)) out.set(kk, vv)
  }
  return out
}

const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  const enMap = flatten(en as Tree)
  const deMap = flatten(de as Tree)

  it('German has exactly the English keys', () => {
    expect([...deMap.keys()].sort()).toEqual([...enMap.keys()].sort())
  })

  it('every German string keeps the English placeholders', () => {
    for (const [key, value] of enMap) expect({ key, vars: placeholders(deMap.get(key) ?? '') }).toEqual({ key, vars: placeholders(value) })
  })

  it('has no empty strings', () => {
    for (const [key, value] of [...enMap, ...deMap]) expect({ key, empty: !value.trim() }).toEqual({ key, empty: false })
  })
})
