import { describe, it, expect } from 'vitest'
import { parseSender } from './parseSender'

describe('parseSender', () => {
  it('parses "Name <email>"', () => {
    expect(parseSender('Anita Roy <anita@acme.com>')).toEqual({ name: 'Anita Roy', email: 'anita@acme.com' })
  })
  it('strips surrounding quotes from the display name', () => {
    expect(parseSender('"Anita Roy" <anita@acme.com>')).toEqual({ name: 'Anita Roy', email: 'anita@acme.com' })
  })
  it('parses a bare email', () => {
    expect(parseSender('anita@acme.com')).toEqual({ name: 'anita', email: 'anita@acme.com' })
  })
  it('trims whitespace', () => {
    expect(parseSender('  Bob <bob@x.io>  ')).toEqual({ name: 'Bob', email: 'bob@x.io' })
  })
  it('returns null for empty or address-less input', () => {
    expect(parseSender('')).toBeNull()
    expect(parseSender(null)).toBeNull()
    expect(parseSender('no address here')).toBeNull()
  })
})
