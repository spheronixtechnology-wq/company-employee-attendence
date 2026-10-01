const { generateSeatingGrid } = require('../services/seatingAllocation.service');
const { isValidSeat } = require('../services/constraintValidator.service');

describe('seatingAllocation.service', () => {
  
  const validateGrid = (grid) => {
    // Check for adjacency violations manually
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const seat = grid[r][c];
        if (seat && !seat.isEmptySeat) {
          // Temporarily remove to use isValidSeat
          const temp = grid[r][c];
          grid[r][c] = null;
          const valid = isValidSeat(grid, r, c, temp.branch);
          grid[r][c] = temp;
          if (!valid) return false;
        }
      }
    }
    return true;
  };

  it('should successfully place 9 students of 3 branches in a 3x3 grid without adjacency', () => {
    const room = { roomNumber: 'R101', rows: 3, columns: 3, capacity: 9 };
    const students = [
      { branch: 'CSE', rollNumber: '1' }, { branch: 'CSE', rollNumber: '2' }, { branch: 'CSE', rollNumber: '3' },
      { branch: 'ECE', rollNumber: '4' }, { branch: 'ECE', rollNumber: '5' }, { branch: 'ECE', rollNumber: '6' },
      { branch: 'AIML', rollNumber: '7' }, { branch: 'AIML', rollNumber: '8' }, { branch: 'AIML', rollNumber: '9' }
    ];

    const result = generateSeatingGrid(room, students);
    
    expect(result.isValid).toBe(true);
    expect(result.grid.length).toBe(3);
    expect(result.grid[0].length).toBe(3);
    expect(validateGrid(result.grid)).toBe(true);
  });

  it('should handle empty seats gracefully if students < capacity', () => {
    const room = { roomNumber: 'R102', rows: 2, columns: 2, capacity: 4 };
    const students = [
      { branch: 'CSE', rollNumber: '1' }, 
      { branch: 'ECE', rollNumber: '2' },
      { branch: 'AIML', rollNumber: '3' }
    ]; // 3 students for 4 seats

    const result = generateSeatingGrid(room, students);
    
    expect(result.isValid).toBe(true);
    
    // Count empty seats
    let emptyCount = 0;
    for(let r=0; r<2; r++){
      for(let c=0; c<2; c++){
        if(result.grid[r][c].isEmptySeat) emptyCount++;
      }
    }
    expect(emptyCount).toBe(1);
    expect(validateGrid(result.grid)).toBe(true);
  });

  it('should fail gracefully if constraint is impossible', () => {
    // 2x2 grid, 4 students of the same branch. Adjacency is impossible.
    const room = { roomNumber: 'R103', rows: 2, columns: 2, capacity: 4 };
    const students = [
      { branch: 'CSE', rollNumber: '1' }, { branch: 'CSE', rollNumber: '2' },
      { branch: 'CSE', rollNumber: '3' }, { branch: 'CSE', rollNumber: '4' }
    ];

    const result = generateSeatingGrid(room, students);
    
    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('Failed to find a valid seating arrangement');
  });

});
