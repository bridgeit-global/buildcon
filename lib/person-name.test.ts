import { describe, expect, it } from 'vitest';
import {
  formatFullName,
  namePartsFromFullName,
  splitFullName
} from './person-name';

describe('formatFullName', () => {
  it('joins non-empty parts', () => {
    expect(
      formatFullName({
        first_name: 'Ravi',
        middle_name: 'Kumar',
        last_name: 'Sharma'
      })
    ).toBe('Ravi Kumar Sharma');
  });

  it('skips blank middle name', () => {
    expect(
      formatFullName({ first_name: 'Ravi', middle_name: '  ', last_name: 'Sharma' })
    ).toBe('Ravi Sharma');
  });
});

describe('splitFullName', () => {
  it('splits two-part names', () => {
    expect(splitFullName('Ravi Sharma')).toEqual({
      first_name: 'Ravi',
      middle_name: '',
      last_name: 'Sharma'
    });
  });

  it('splits three-plus-part names', () => {
    expect(splitFullName('Ravi Kumar Das Sharma')).toEqual({
      first_name: 'Ravi',
      middle_name: 'Kumar Das',
      last_name: 'Sharma'
    });
  });

  it('puts single token in first_name', () => {
    expect(splitFullName('Madonna')).toEqual({
      first_name: 'Madonna',
      middle_name: '',
      last_name: ''
    });
  });
});

describe('namePartsFromFullName', () => {
  it('returns parts and recomposed full_name', () => {
    expect(namePartsFromFullName('  Amit  Deshmukh ')).toEqual({
      first_name: 'Amit',
      middle_name: '',
      last_name: 'Deshmukh',
      full_name: 'Amit Deshmukh'
    });
  });
});
