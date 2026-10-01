const { isValidSeat } = require('./constraintValidator.service');

// Generate grid using backtracking
exports.generateSeatingGrid = (room, allocatedStudents) => {
  const { rows, columns, roomNumber } = room;
  const grid = Array.from({ length: rows }, () => Array(columns).fill(null));
  
  // Group by branch to speed up candidate selection
  const branchPool = {};
  allocatedStudents.forEach(s => {
    if (!branchPool[s.branch]) branchPool[s.branch] = [];
    branchPool[s.branch].push(s);
  });
  
  const branches = Object.keys(branchPool);
  let totalStudents = allocatedStudents.length;
  
  // Time and attempt limits
  const startTime = Date.now();
  const maxExecutionTime = 10000; // 10 seconds max per room
  let attempts = 0;
  const maxAttempts = 100000; // Limit node expansions

  const solve = (r, c) => {
    if (r === rows) return true; // Successfully filled all rows
    
    // Limits check
    attempts++;
    if (attempts > maxAttempts || (Date.now() - startTime) > maxExecutionTime) {
      return false; // Time/Attempt exceeded
    }

    let nextR = c === columns - 1 ? r + 1 : r;
    let nextC = c === columns - 1 ? 0 : c + 1;

    // Check if we can just put an empty seat (if total remaining students < remaining seats)
    const remainingSeats = (rows - r - 1) * columns + (columns - c);
    
    // We should try branches in a randomized order to get different plans
    const shuffledBranches = branches.slice().sort(() => Math.random() - 0.5);

    for (const branch of shuffledBranches) {
      if (branchPool[branch].length > 0) {
        if (isValidSeat(grid, r, c, branch)) {
          // Place
          const student = branchPool[branch].pop();
          grid[r][c] = student;
          totalStudents--;

          if (solve(nextR, nextC)) return true;

          // Backtrack
          branchPool[branch].push(student);
          grid[r][c] = null;
          totalStudents++;
        }
      }
    }

    // Try empty seat if we have more seats than students
    if (totalStudents < remainingSeats) {
       grid[r][c] = { isEmptySeat: true };
       if (solve(nextR, nextC)) return true;
       grid[r][c] = null;
    }

    return false;
  };

  const success = solve(0, 0);
  
  if (!success) {
    return {
      grid: [],
      violations: [`Failed to find a valid seating arrangement for room ${roomNumber} within limits (Time: ${Date.now() - startTime}ms, Attempts: ${attempts}). Constraints are likely impossible.`],
      isValid: false
    };
  }

  // Add seat identifiers
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const seat = grid[r][c];
      const seatIdentifier = `${roomNumber}-R${String(r+1).padStart(2, '0')}-C${String(c+1).padStart(2, '0')}`;
      if (seat) {
        seat.row = r;
        seat.column = c;
        seat.seatIdentifier = seatIdentifier;
      }
    }
  }

  return {
    grid,
    violations: [],
    isValid: true
  };
};
