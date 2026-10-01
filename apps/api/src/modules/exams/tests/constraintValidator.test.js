const { isValidSeat, checkRoomBranchMinimum } = require('../services/constraintValidator.service');

describe('constraintValidator.service', () => {
  
  describe('checkRoomBranchMinimum', () => {
    it('should return true if all branches meet the minimum', () => {
      const allocated = [
        { branch: 'CSE' }, { branch: 'CSE' }, { branch: 'CSE' },
        { branch: 'ECE' }, { branch: 'ECE' }, { branch: 'ECE' }
      ];
      expect(checkRoomBranchMinimum(allocated, 3)).toBe(true);
    });

    it('should return false if any branch does not meet the minimum', () => {
      const allocated = [
        { branch: 'CSE' }, { branch: 'CSE' }, { branch: 'CSE' },
        { branch: 'ECE' }, { branch: 'ECE' } // ECE has only 2
      ];
      expect(checkRoomBranchMinimum(allocated, 3)).toBe(false);
    });

    it('should ignore empty seats', () => {
      const allocated = [
        { branch: 'CSE' }, { branch: 'CSE' }, { branch: 'CSE' },
        { isEmptySeat: true }
      ];
      expect(checkRoomBranchMinimum(allocated, 3)).toBe(true);
    });

    it('should return true if minimum is 0 or less', () => {
      const allocated = [{ branch: 'CSE' }];
      expect(checkRoomBranchMinimum(allocated, 0)).toBe(true);
    });
  });

  describe('isValidSeat', () => {
    let grid;

    beforeEach(() => {
      // 3x3 grid
      grid = [
        [{ branch: 'CSE' }, { branch: 'ECE' }, { branch: 'CSE' }],
        [{ branch: 'ECE' }, null, { branch: 'ECE' }],
        [{ branch: 'CSE' }, { branch: 'CSE' }, { branch: 'ECE' }]
      ];
    });

    it('should return false if top neighbor matches', () => {
      // Try to place ECE at (1,1). Top is ECE.
      expect(isValidSeat(grid, 1, 1, 'ECE')).toBe(false);
    });

    it('should return false if bottom neighbor matches', () => {
      // Try to place CSE at (1,1). Bottom is CSE.
      expect(isValidSeat(grid, 1, 1, 'CSE')).toBe(false);
    });

    it('should return false if left neighbor matches', () => {
      // Grid: (1,0) is ECE. If we try ECE at (1,1), left matches.
      expect(isValidSeat(grid, 1, 1, 'ECE')).toBe(false);
    });

    it('should return false if right neighbor matches', () => {
      // Grid: (1,2) is ECE. If we try ECE at (1,1), right matches.
      expect(isValidSeat(grid, 1, 1, 'ECE')).toBe(false);
    });

    it('should return true if no neighbors match', () => {
      // Grid: top=ECE, bottom=CSE, left=ECE, right=ECE
      // If we place AIML, it should be valid.
      expect(isValidSeat(grid, 1, 1, 'AIML')).toBe(true);
    });

    it('should handle edges correctly without crashing', () => {
      // Top left corner (0,0) with new grid
      const emptyGrid = [
        [null, null],
        [null, null]
      ];
      expect(isValidSeat(emptyGrid, 0, 0, 'CSE')).toBe(true);
      
      // Bottom right corner (1,1)
      expect(isValidSeat(emptyGrid, 1, 1, 'CSE')).toBe(true);
    });
  });
});
