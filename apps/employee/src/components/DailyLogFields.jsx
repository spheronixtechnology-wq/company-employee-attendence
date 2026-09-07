import { Sparkles } from 'lucide-react';

/**
 * Shared form fields component for Daily Log submissions.
 * Renders team-specific fields based on team name, without manual "Hours Spent" field.
 */
export default function DailyLogFields({ form, onChange, teamName = '' }) {
  const normalizedTeam = (teamName || '').toLowerCase();
  const isTechnical = normalizedTeam.includes('tech') || normalizedTeam.includes('dev') || normalizedTeam.includes('engineering');
  const isMarketing = normalizedTeam.includes('market') || normalizedTeam.includes('growth') || normalizedTeam.includes('sales');

  return (
    <div className="space-y-4">
      {/* Informational banner about automatic hours calculation */}
      <div className="flex items-center gap-2 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs text-violet-300">
        <Sparkles size={14} className="text-violet-400 flex-shrink-0" />
        <span>Work hours will be calculated automatically based on your active shift duration and breaks.</span>
      </div>

      {/* Technical Team Fields */}
      {isTechnical && (
        <>
          <div>
            <label className="label text-xs">Task Title *</label>
            <input
              type="text"
              id="field-task-title"
              required
              placeholder="e.g. Implemented OAuth2 token refresh & unit tests"
              className="input text-sm"
              value={form.taskTitle || ''}
              onChange={(e) => onChange('taskTitle', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Project Name *</label>
              <input
                type="text"
                id="field-project-name"
                required
                placeholder="e.g. Attendance System v2"
                className="input text-sm"
                value={form.projectName || ''}
                onChange={(e) => onChange('projectName', e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Ticket / Issue ID</label>
              <input
                type="text"
                id="field-ticket-id"
                placeholder="e.g. SPH-1042"
                className="input text-sm"
                value={form.ticketId || ''}
                onChange={(e) => onChange('ticketId', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label text-xs">Blockers / Roadblocks</label>
            <textarea
              id="field-blockers"
              rows={2}
              placeholder="Any dependencies, blocked tasks, or environment issues (optional)"
              className="input text-sm resize-none"
              value={form.blockers || ''}
              onChange={(e) => onChange('blockers', e.target.value)}
            />
          </div>
        </>
      )}

      {/* Marketing Team Fields */}
      {isMarketing && (
        <>
          <div>
            <label className="label text-xs">Campaign Name *</label>
            <input
              type="text"
              id="field-campaign-name"
              required
              placeholder="e.g. Q3 Brand Awareness - LinkedIn Ads"
              className="input text-sm"
              value={form.campaignName || ''}
              onChange={(e) => onChange('campaignName', e.target.value)}
            />
          </div>

          <div>
            <label className="label text-xs">Platform / Channel *</label>
            <input
              type="text"
              id="field-platform"
              required
              placeholder="e.g. LinkedIn, Instagram, Email Newsletter"
              className="input text-sm"
              value={form.platform || ''}
              onChange={(e) => onChange('platform', e.target.value)}
            />
          </div>

          <div>
            <label className="label text-xs">Output Summary / Deliverables</label>
            <textarea
              id="field-output-summary"
              rows={3}
              placeholder="Key creatives published, engagement metrics, or outreach completed..."
              className="input text-sm resize-none"
              value={form.outputSummary || ''}
              onChange={(e) => onChange('outputSummary', e.target.value)}
            />
          </div>
        </>
      )}

      {/* Generic / Other Teams */}
      {!isTechnical && !isMarketing && (
        <>
          <div>
            <label className="label text-xs">Task Title *</label>
            <input
              type="text"
              id="field-task-title"
              required
              placeholder="Primary task completed today..."
              className="input text-sm"
              value={form.taskTitle || ''}
              onChange={(e) => onChange('taskTitle', e.target.value)}
            />
          </div>

          <div>
            <label className="label text-xs">Work Summary</label>
            <textarea
              id="field-output-summary"
              rows={3}
              placeholder="Describe tasks completed, meetings attended, or deliverables shipped..."
              className="input text-sm resize-none"
              value={form.outputSummary || ''}
              onChange={(e) => onChange('outputSummary', e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
