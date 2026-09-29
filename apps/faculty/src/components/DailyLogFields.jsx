import { Sparkles, Plus, Trash2, CheckCircle2, AlertCircle, Link2, ExternalLink } from 'lucide-react';

export const GITHUB_URL_REGEX = /^(https?:\/\/)?(www\.)?(github\.com\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*|gist\.github\.com\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*)\/?$/i;

/**
 * Validates whether a given string is a valid GitHub URL.
 */
export const isValidGitHubUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!GITHUB_URL_REGEX.test(trimmed)) return false;
  try {
    const fullUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'github.com' && host !== 'gist.github.com') return false;
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    return pathParts.length >= 1;
  } catch {
    return false;
  }
};

/**
 * Validates whether a research link is a valid web URL.
 */
export const isValidWebUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const fullUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
};

/**
 * Unified form fields component for Daily Log submissions.
 * Fields:
 * 1. Task Title (required)
 * 2. Project Name (required)
 * 3. Description (required)
 * 4. GitHub Link (optional with live validation)
 * 5. Research Links (optional, multi-link dynamic list)
 */
export default function DailyLogFields({ form = {}, onChange, errors = {} }) {
  const githubValue = form.githubLink || '';
  const isGithubFilled = Boolean(githubValue.trim());
  const isGithubValid = isGithubFilled ? isValidGitHubUrl(githubValue) : null;

  const rawResearchLinks = Array.isArray(form.researchLinks) && form.researchLinks.length > 0
    ? form.researchLinks
    : [''];

  const handleResearchLinkChange = (index, value) => {
    const updated = [...rawResearchLinks];
    updated[index] = value;
    onChange('researchLinks', updated);
  };

  const handleAddResearchLink = () => {
    onChange('researchLinks', [...rawResearchLinks, '']);
  };

  const handleRemoveResearchLink = (index) => {
    const updated = rawResearchLinks.filter((_, idx) => idx !== index);
    onChange('researchLinks', updated.length > 0 ? updated : ['']);
  };

  return (
    <div className="space-y-4">
      {/* Informational banner about automatic hours calculation */}
      <div className="flex items-center gap-2.5 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-xs text-violet-300">
        <Sparkles size={14} className="text-violet-400 flex-shrink-0" />
        <span>Work hours will be calculated automatically based on your active shift duration and breaks.</span>
      </div>

      {/* 1. Task Title (Required) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label text-xs !mb-0">Task Title *</label>
          {errors.taskTitle && <span className="text-[11px] text-rose-400">{errors.taskTitle}</span>}
        </div>
        <input
          type="text"
          id="field-task-title"
          required
          placeholder="e.g. Implemented OAuth2 token refresh & unit tests"
          className={`input text-sm ${errors.taskTitle ? 'border-rose-500/60 focus:border-rose-500' : ''}`}
          value={form.taskTitle || ''}
          onChange={(e) => onChange('taskTitle', e.target.value)}
        />
      </div>

      {/* 2. Project Name (Required) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label text-xs !mb-0">Project Name *</label>
          {errors.projectName && <span className="text-[11px] text-rose-400">{errors.projectName}</span>}
        </div>
        <input
          type="text"
          id="field-project-name"
          required
          placeholder="e.g. Attendance System v2"
          className={`input text-sm ${errors.projectName ? 'border-rose-500/60 focus:border-rose-500' : ''}`}
          value={form.projectName || ''}
          onChange={(e) => onChange('projectName', e.target.value)}
        />
      </div>

      {/* 3. Description (Required) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label text-xs !mb-0">Description *</label>
          {errors.description && <span className="text-[11px] text-rose-400">{errors.description}</span>}
        </div>
        <textarea
          id="field-description"
          required
          rows={3}
          placeholder="Describe your work, progress made today, key decisions, or technical notes..."
          className={`input text-sm resize-none ${errors.description ? 'border-rose-500/60 focus:border-rose-500' : ''}`}
          value={form.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
        />
      </div>

      {/* 4. GitHub Link (Optional, with Live Validation) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label text-xs !mb-0 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub Link</span>
            <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          {isGithubFilled && (
            <span className={`text-[11px] flex items-center gap-1 font-medium ${isGithubValid ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isGithubValid ? (
                <>
                  <CheckCircle2 size={12} /> Valid GitHub link
                </>
              ) : (
                <>
                  <AlertCircle size={12} /> Invalid GitHub URL
                </>
              )}
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type="text"
            id="field-github-link"
            placeholder="https://github.com/organization/repository/pull/123"
            className={`input text-sm pr-9 ${
              isGithubFilled
                ? isGithubValid
                  ? 'border-emerald-500/60 focus:border-emerald-500 bg-emerald-950/10'
                  : 'border-rose-500/60 focus:border-rose-500 bg-rose-950/10'
                : ''
            }`}
            value={githubValue}
            onChange={(e) => onChange('githubLink', e.target.value)}
          />
          {isGithubFilled && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              {isGithubValid ? (
                <CheckCircle2 size={16} className="text-emerald-400" />
              ) : (
                <AlertCircle size={16} className="text-rose-400" />
              )}
            </div>
          )}
        </div>
        {isGithubFilled && !isGithubValid && (
          <p className="text-[11px] text-rose-400 mt-1 pl-0.5">
            Must be a valid GitHub link (e.g., <code className="text-rose-300">https://github.com/owner/repo</code> or PR/issue link).
          </p>
        )}
      </div>

      {/* 5. Research Links (Optional, Multi-Entry Dynamic List) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="label text-xs !mb-0 flex items-center gap-1.5">
            <Link2 size={13} className="text-slate-400" />
            <span>Research Links</span>
            <span className="text-slate-500 font-normal">(optional - add more than one)</span>
          </label>
          <button
            type="button"
            id="add-research-link-btn"
            onClick={handleAddResearchLink}
            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-medium transition-colors hover:underline"
          >
            <Plus size={13} /> Add Link
          </button>
        </div>

        <div className="space-y-2">
          {rawResearchLinks.map((link, idx) => {
            const hasValue = Boolean(link.trim());
            const isValid = hasValue ? isValidWebUrl(link) : null;
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      id={`field-research-link-${idx}`}
                      placeholder={`Research URL ${idx + 1} (e.g. https://stackoverflow.com/... or docs link)`}
                      className={`input text-xs py-2 pr-7 ${
                        hasValue
                          ? isValid
                            ? 'border-slate-700 focus:border-violet-500'
                            : 'border-rose-500/50 focus:border-rose-500'
                          : ''
                      }`}
                      value={link}
                      onChange={(e) => handleResearchLinkChange(idx, e.target.value)}
                    />
                    {hasValue && isValid && (
                      <a
                        href={link.startsWith('http') ? link : `https://${link}`}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        title="Open link in new tab"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {rawResearchLinks.length > 1 && (
                    <button
                      type="button"
                      id={`remove-research-link-btn-${idx}`}
                      onClick={() => handleRemoveResearchLink(idx)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remove link"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {hasValue && !isValid && (
                  <p className="text-[10px] text-rose-400 pl-1">
                    Please enter a valid URL (e.g., https://example.com/docs).
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
