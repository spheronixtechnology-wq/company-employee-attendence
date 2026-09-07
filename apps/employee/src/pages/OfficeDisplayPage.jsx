import { Building2 } from 'lucide-react';

const OfficeDisplayPage = () => {
  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-4xl mx-auto mt-6">
      <div className="card p-8 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 shadow-xl backdrop-blur-sm text-center">
        <div className="mx-auto w-16 h-16 bg-primary-500/10 rounded-full flex items-center justify-center mb-6">
          <Building2 size={32} className="text-primary-400" />
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Office Dashboard Display</h1>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto">
          This view is intended for large screens in the office to display today's active attendance QR code or general office announcements.
        </p>
        <div className="bg-slate-900/50 p-12 rounded-2xl border border-slate-700/50 inline-block">
          <div className="w-64 h-64 border-4 border-dashed border-slate-600 flex items-center justify-center rounded-xl text-slate-500 font-mono text-sm">
            [QR CODE PLACEHOLDER]
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfficeDisplayPage;
