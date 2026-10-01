const { checkRoomBranchMinimum } = require('./constraintValidator.service');

// Utility to shuffle an array
const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

exports.allocateRooms = (students, rooms, rules) => {
  const minStudents = rules?.minimumStudentsPerBranchPerRoom || 1;
  const allocations = {};
  rooms.forEach(r => { allocations[r.roomNumber] = []; });
  
  // Group students by branch
  const byBranch = {};
  for (const s of students) {
    if (!byBranch[s.branch]) byBranch[s.branch] = [];
    byBranch[s.branch].push(s);
  }

  // Shuffle within branches
  for (const branch in byBranch) {
    byBranch[branch] = shuffle(byBranch[branch]);
  }

  const branches = Object.keys(byBranch);

  for (const room of rooms) {
    let remainingCapacity = room.capacity;
    
    // First pass: try to assign exactly minStudents to as many branches as fit
    let availableBranches = shuffle(branches.filter(b => byBranch[b].length >= minStudents));
    
    for (const branch of availableBranches) {
      if (remainingCapacity < minStudents) break;
      
      const studentsOfBranch = byBranch[branch];
      if (studentsOfBranch.length >= minStudents) {
        const selected = studentsOfBranch.splice(0, minStudents);
        allocations[room.roomNumber].push(...selected);
        remainingCapacity -= minStudents;
      }
    }
    
    // Second pass: distribute remaining capacity among branches already in the room
    const branchesInRoom = [...new Set(allocations[room.roomNumber].map(s => s.branch))];
    while (remainingCapacity > 0) {
      let allocatedInThisRound = false;
      const shuffBranchesInRoom = shuffle(branchesInRoom);
      
      for (const branch of shuffBranchesInRoom) {
        if (remainingCapacity === 0) break;
        
        const studentsOfBranch = byBranch[branch];
        if (studentsOfBranch && studentsOfBranch.length > 0) {
          const selected = studentsOfBranch.splice(0, 1); // Take 1 at a time for even distribution
          allocations[room.roomNumber].push(...selected);
          remainingCapacity -= 1;
          allocatedInThisRound = true;
        }
      }
      
      if (!allocatedInThisRound) {
        // Third pass: if we still have space but branches in room are exhausted, 
        // we might need to add a new branch if we have at least minStudents of it.
        const freshBranches = shuffle(branches.filter(b => byBranch[b].length >= minStudents && !branchesInRoom.includes(b)));
        let freshAllocated = false;
        for (const branch of freshBranches) {
          if (remainingCapacity >= minStudents) {
             const studentsOfBranch = byBranch[branch];
             const selected = studentsOfBranch.splice(0, minStudents);
             allocations[room.roomNumber].push(...selected);
             branchesInRoom.push(branch);
             remainingCapacity -= minStudents;
             freshAllocated = true;
             break;
          }
        }
        if (!freshAllocated) break; // Can't fill the room completely while respecting rules
      }
    }
  }

  // 4th pass: Relaxed fit. If any students are left over in ANY branch, 
  // just put them in ANY room that has remaining capacity, regardless of minStudents.
  for (const room of rooms) {
    let remainingCapacity = room.capacity - allocations[room.roomNumber].length;
    if (remainingCapacity > 0) {
      for (const branch of branches) {
        if (remainingCapacity === 0) break;
        const studentsOfBranch = byBranch[branch];
        if (studentsOfBranch && studentsOfBranch.length > 0) {
          const toTake = Math.min(studentsOfBranch.length, remainingCapacity);
          const selected = studentsOfBranch.splice(0, toTake);
          allocations[room.roomNumber].push(...selected);
          remainingCapacity -= toTake;
        }
      }
    }
  }

  // Check if any students remain unallocated
  let unallocated = 0;
  for (const branch in byBranch) {
    unallocated += byBranch[branch].length;
  }

  const violations = [];
  if (unallocated > 0) {
    violations.push(`Failed to allocate ${unallocated} students. Rooms are likely full. Increase capacity.`);
  }

  // Note: We skip checkRoomBranchMinimum because the user explicitly allowed remainders 
  // to be allocated even if they don't meet the min 5 threshold.

  return { allocations, violations, isValid: violations.length === 0 };
};
