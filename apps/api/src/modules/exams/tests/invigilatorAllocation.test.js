const { allocateInvigilators } = require('../services/invigilatorAllocation.service');

describe('invigilatorAllocation.service', () => {
  it('should allocate correct number of invigilators based on capacity', () => {
    const rooms = [
      { roomNumber: 'R1', capacity: 30 }, // needs 1
      { roomNumber: 'R2', capacity: 60 }  // needs 2
    ];
    
    const faculty = [
      { facultyId: 'F1', available: true, maximumDuties: 1, preferredSession: 'ANY' },
      { facultyId: 'F2', available: true, maximumDuties: 1, preferredSession: 'ANY' },
      { facultyId: 'F3', available: true, maximumDuties: 1, preferredSession: 'ANY' },
    ];

    const result = allocateInvigilators(rooms, faculty, 'FN');
    
    expect(result.isValid).toBe(true);
    expect(result.assignments['R1'].length).toBe(1);
    expect(result.assignments['R2'].length).toBe(2);
  });

  it('should fail if not enough available faculty', () => {
    const rooms = [
      { roomNumber: 'R1', capacity: 30 }, // needs 1
    ];
    
    // F1 is unavailable
    const faculty = [
      { facultyId: 'F1', available: false, maximumDuties: 1, preferredSession: 'ANY' },
    ];

    const result = allocateInvigilators(rooms, faculty, 'FN');
    
    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('Not enough available faculty');
  });

  it('should filter by preferred session', () => {
    const rooms = [
      { roomNumber: 'R1', capacity: 30 }, // needs 1
    ];
    
    // F1 wants AN, F2 wants FN
    const faculty = [
      { facultyId: 'F1', available: true, maximumDuties: 1, preferredSession: 'AN' },
      { facultyId: 'F2', available: true, maximumDuties: 1, preferredSession: 'FN' },
    ];

    const result = allocateInvigilators(rooms, faculty, 'FN');
    
    expect(result.isValid).toBe(true);
    expect(result.assignments['R1'].length).toBe(1);
    expect(result.assignments['R1'][0].facultyId).toBe('F2');
  });
});
