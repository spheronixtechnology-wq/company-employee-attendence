const { isNonWorkingDay, VARIABLE_HOLIDAYS, parseExtraHolidays } = require('../../src/config/holidays');

describe('Working-day calendar (isNonWorkingDay)', () => {
  const originalExtra = process.env.HOLIDAYS_EXTRA;
  afterEach(() => {
    process.env.HOLIDAYS_EXTRA = originalExtra;
  });

  it('treats Saturday and Sunday as weekend', () => {
    expect(isNonWorkingDay('2026-10-24')).toEqual({ isNonWorkingDay: true, reason: 'weekend' });
    expect(isNonWorkingDay('2026-10-25')).toEqual({ isNonWorkingDay: true, reason: 'weekend' });
  });

  it('treats a regular weekday as a working day', () => {
    expect(isNonWorkingDay('2026-10-27')).toEqual({ isNonWorkingDay: false, reason: null });
  });

  it('treats fixed national holidays as holidays in any year', () => {
    expect(isNonWorkingDay('2026-10-02')).toEqual({ isNonWorkingDay: true, reason: 'holiday' });
    expect(isNonWorkingDay('2029-01-26')).toEqual({ isNonWorkingDay: true, reason: 'holiday' });
  });

  it('honours HOLIDAYS_EXTRA and ignores malformed entries', () => {
    process.env.HOLIDAYS_EXTRA = '2026-10-28, not-a-date ,2026-13';
    expect(parseExtraHolidays()).toEqual(['2026-10-28']);
    expect(isNonWorkingDay('2026-10-28')).toEqual({ isNonWorkingDay: true, reason: 'holiday' });
  });

  it("has next year's variable holiday list filled in by December", () => {
    const now = new Date();
    if (now.getMonth() === 11) {
      expect((VARIABLE_HOLIDAYS[now.getFullYear() + 1] || []).length).toBeGreaterThan(0);
    }
  });
});
