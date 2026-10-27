import React, { useState } from 'react';
import { Search, Users } from 'lucide-react';

export default function EmployeeAudiencePicker({
  employeeScope,
  setEmployeeScope,
  selectedEmployeeIds,
  setSelectedEmployeeIds,
  employees = [],
  loading = false,
}) {
  const [employeeSearch, setEmployeeSearch] = useState('');

  const filteredEmployees = employees.filter((emp) => {
    if (!employeeSearch.trim()) return true;
    const q = employeeSearch.toLowerCase();
    return (
      emp.name?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q) ||
      emp.employeeId?.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q)
    );
  });

  const toggleSelectEmployee = (id) => {
    const idStr = String(id);
    if (selectedEmployeeIds.includes(idStr)) {
      setSelectedEmployeeIds(selectedEmployeeIds.filter((item) => item !== idStr));
    } else {
      setSelectedEmployeeIds([...selectedEmployeeIds, idStr]);
    }
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredEmployees.map((e) => String(e._id));
    const merged = Array.from(new Set([...selectedEmployeeIds, ...filteredIds]));
    setSelectedEmployeeIds(merged);
  };

  const handleClearSelection = () => {
    setSelectedEmployeeIds([]);
  };

  return (
    <div className="space-y-3">
      {/* Scope Mode Selector */}
      <div className="grid grid-cols-2 gap-2">
        <label
          className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
            employeeScope === 'all'
              ? 'border-violet-600 bg-violet-50 text-violet-800 shadow-xs'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <input
            type="radio"
            name="scope"
            value="all"
            checked={employeeScope === 'all'}
            onChange={() => setEmployeeScope('all')}
            className="hidden"
          />
          <Users size={14} className={employeeScope === 'all' ? 'text-violet-600' : 'text-slate-400'} />
          All Employees (Org-Wide)
        </label>

        <label
          className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
            employeeScope === 'restricted'
              ? 'border-violet-600 bg-violet-50 text-violet-800 shadow-xs'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <input
            type="radio"
            name="scope"
            value="restricted"
            checked={employeeScope === 'restricted'}
            onChange={() => setEmployeeScope('restricted')}
            className="hidden"
          />
          <Users size={14} className={employeeScope === 'restricted' ? 'text-violet-600' : 'text-slate-400'} />
          Restricted Employee List
        </label>
      </div>

      {/* If Restricted: Interactive Searchable Multi-Select Picker */}
      {employeeScope === 'restricted' && (
        <div className="space-y-2.5 pt-1 animate-fade-in">
          {/* Search Bar + Batch Controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search by name, ID, or department..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Select Filtered
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Clear
            </button>
          </div>

          {/* Selection Count Pill */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>
              Selected: <strong className="text-violet-700 font-bold">{selectedEmployeeIds.length}</strong> of {employees.length}
            </span>
            {selectedEmployeeIds.length === 0 && (
              <span className="text-rose-500 font-semibold">Select at least 1 employee</span>
            )}
          </div>

          {/* Employee List */}
          <div className="border border-slate-200 rounded-xl bg-white max-h-52 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading employees...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No matching employees found</div>
            ) : (
              filteredEmployees.map((emp) => {
                const isSelected = selectedEmployeeIds.includes(String(emp._id));
                return (
                  <label
                    key={emp._id}
                    className={`flex items-center justify-between p-2.5 hover:bg-violet-50/50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-violet-50/70' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectEmployee(emp._id)}
                        className="rounded text-violet-600 focus:ring-violet-500 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{emp.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {emp.employeeId ? `#${emp.employeeId} · ` : ''}{emp.department || 'General'}
                        </p>
                      </div>
                    </div>
                    {emp.designation && (
                      <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                        {emp.designation}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
