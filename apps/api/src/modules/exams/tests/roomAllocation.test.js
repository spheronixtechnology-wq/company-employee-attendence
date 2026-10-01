const { allocateRooms } = require('../services/roomAllocation.service');

describe('roomAllocation.service', () => {
  it('should allocate students to rooms distributing capacities', () => {
    const rooms = [
      { roomNumber: 'R1', capacity: 10 },
      { roomNumber: 'R2', capacity: 10 }
    ];
    
    // 20 students, 10 CSE, 10 ECE
    const students = Array.from({ length: 10 }).map((_, i) => ({ branch: 'CSE', rollNumber: `C${i}` }))
      .concat(Array.from({ length: 10 }).map((_, i) => ({ branch: 'ECE', rollNumber: `E${i}` })));

    const result = allocateRooms(students, rooms, { minimumStudentsPerBranchPerRoom: 5 });
    
    expect(result.isValid).toBe(true);
    
    const r1Students = result.allocations['R1'];
    const r2Students = result.allocations['R2'];
    
    expect(r1Students.length).toBe(10);
    expect(r2Students.length).toBe(10);
    
    // Test that the min branch rule is somewhat respected (if possible)
    // Because we used 10 CSE and 10 ECE and capacity is 10/10, each room probably got 5/5
    const r1Cse = r1Students.filter(s => s.branch === 'CSE').length;
    const r1Ece = r1Students.filter(s => s.branch === 'ECE').length;
    
    if (r1Cse > 0) expect(r1Cse).toBeGreaterThanOrEqual(5);
    if (r1Ece > 0) expect(r1Ece).toBeGreaterThanOrEqual(5);
  });

  it('should fail if minimum branch rule is impossible', () => {
    const rooms = [
      { roomNumber: 'R1', capacity: 10 }
    ];
    
    const students = Array.from({ length: 9 }).map((_, i) => ({ branch: 'CSE', rollNumber: `C${i}` }))
      .concat([{ branch: 'AIML', rollNumber: 'A1' }]); // Only 1 AIML

    // If min is 5, we can't place AIML. 
    // And if capacity is 10, and we skip AIML, we can only place 9 CSE.
    // So 1 student (AIML) will remain unallocated.
    const result = allocateRooms(students, rooms, { minimumStudentsPerBranchPerRoom: 5 });
    
    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('Failed to allocate');
  });
});
