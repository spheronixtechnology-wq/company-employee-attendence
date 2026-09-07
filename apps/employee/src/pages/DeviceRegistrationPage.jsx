import { Smartphone } from 'lucide-react';

const DeviceRegistrationPage = () => {
  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-2xl mx-auto mt-10">
      <div className="card p-8 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 shadow-xl backdrop-blur-sm text-center">
        <div className="mx-auto w-16 h-16 bg-primary-500/10 rounded-full flex items-center justify-center mb-6">
          <Smartphone size={32} className="text-primary-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Device Registration</h1>
        <p className="text-slate-400 mb-8">
          Register your current device to be used for daily attendance clock-ins.
        </p>
        <button className="btn-primary w-full">
          Register This Device
        </button>
      </div>
    </div>
  );
};

export default DeviceRegistrationPage;
