// constraintValidator.service.js

exports.checkRoomBranchMinimum = (allocatedStudents, minStudents) => {
  if (minStudents <= 0) return true;
  
  const branchCounts = {};
  for (const s of allocatedStudents) {
    if (s && !s.isEmptySeat) {
      branchCounts[s.branch] = (branchCounts[s.branch] || 0) + 1;
    }
  }

  for (const branch in branchCounts) {
    if (branchCounts[branch] < minStudents) {
      return false; // Found a branch that doesn't meet the minimum
    }
  }
  
  return true;
};

exports.isValidSeat = (grid, row, col, candidateBranch) => {
  // Check TOP
  if (row > 0) {
    const topSeat = grid[row - 1][col];
    if (topSeat && !topSeat.isEmptySeat && topSeat.branch === candidateBranch) return false;
  }
  // Check BOTTOM (if already placed, though in sequential generation it might be null)
  if (row < grid.length - 1) {
    const bottomSeat = grid[row + 1][col];
    if (bottomSeat && !bottomSeat.isEmptySeat && bottomSeat.branch === candidateBranch) return false;
  }
  // Check LEFT
  if (col > 0) {
    const leftSeat = grid[row][col - 1];
    if (leftSeat && !leftSeat.isEmptySeat && leftSeat.branch === candidateBranch) return false;
  }
  // Check RIGHT
  if (col < grid[row].length - 1) {
    const rightSeat = grid[row][col + 1];
    if (rightSeat && !rightSeat.isEmptySeat && rightSeat.branch === candidateBranch) return false;
  }
  
  return true;
};
