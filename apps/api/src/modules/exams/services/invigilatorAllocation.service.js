// Utility to shuffle
const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

exports.allocateInvigilators = (rooms, faculty, session, rules = {}) => {
  const assignments = {}; // roomNumber -> array of faculty
  const violations = [];
  const requiredInvigilatorsPerRoom = rules.invigilatorsPerRoom || 1;
  
  // Filter available faculty and for the correct session
  const availableFaculty = faculty.filter(f => 
    f.available && 
    f.maximumDuties > 0 && 
    (f.preferredSession === 'ANY' || f.preferredSession === session)
  );

  // Shuffle to prevent the same people from always getting duties
  const shuffledFaculty = shuffle(availableFaculty);
  let facultyIndex = 0;

  for (const room of rooms) {
    assignments[room.roomNumber] = [];
    
    // Instead of basing it on capacity, use the explicitly requested number
    const requiredInvigilators = requiredInvigilatorsPerRoom;

    for (let i = 0; i < requiredInvigilators; i++) {
      if (facultyIndex < shuffledFaculty.length) {
        assignments[room.roomNumber].push(shuffledFaculty[facultyIndex]);
        
        // Track workload (decrement duties if we were saving state across exams)
        // Here we just consume one duty for this exam
        
        facultyIndex++;
      } else {
        violations.push(`Not enough available faculty for room ${room.roomNumber}. Required: ${requiredInvigilators}.`);
      }
    }
  }

  return {
    assignments,
    violations,
    isValid: violations.length === 0
  };
};
