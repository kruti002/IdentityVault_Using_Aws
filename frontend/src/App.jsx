import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Check
} from 'lucide-react';
import FaceCropper from './components/FaceCropper';
import axios from 'axios';

// Add CloudUpload to missing imports
const CloudUpload = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
  </svg>
);

const CONFIG = {
  API_ENDPOINT: 'https://1bpbbqcqg6.execute-api.us-east-2.amazonaws.com'
};

function App() {
  const [step, setStep] = useState('UPLOAD_ID'); // UPLOAD_ID, EXTRACT_FACE, SUBMIT_ID, UPLOAD_SELFIE, VERIFYING, RESULT
  const [idImage, setIdImage] = useState(null);
  const [idImageBlob, setIdImageBlob] = useState(null);
  const [faceBlob, setFaceBlob] = useState(null);
  const [selfieBlob, setSelfieBlob] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);

  const [showCropper, setShowCropper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kycId, setKycId] = useState(null);
  const [uploadUrls, setUploadUrls] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const idInputRef = useRef(null);
  const selfieInputRef = useRef(null);

  /* ---------------- ID UPLOAD ---------------- */

  const handleIdUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIdImageBlob(file);
    const reader = new FileReader();
    reader.onload = () => {
      setIdImage(reader.result);
      setStep('EXTRACT_FACE');
    };
    reader.readAsDataURL(file);
  };

  /* ---------------- FACE EXTRACTION ---------------- */

  const onCropComplete = (blob) => {
    setFaceBlob(blob);
    setShowCropper(false);
    setStep('SUBMIT_ID');
  };

  /* ---------------- SUBMIT ID + FACE ---------------- */

  const submitIdAndFace = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: response } = await axios.post(`${CONFIG.API_ENDPOINT}/get-urls`);
      console.log("Raw Get URLs Result:", response);

      // Handle both raw body and API Gateway proxy response formats
      let data = response;
      if (typeof response.body === 'string') {
        try {
          data = JSON.parse(response.body);
        } catch (e) {
          console.warn("Could not parse response.body as JSON", e);
        }
      }

      if (!data || !data.urls) {
        throw new Error("Invalid response from /get-urls. 'urls' is missing.");
      }

      setKycId(data.kyc_id);
      setUploadUrls(data.urls);

      const headers = { headers: { 'Content-Type': 'image/jpeg' } };

      await Promise.all([
        axios.put(data.urls.orig_url, idImageBlob, headers),
        axios.put(data.urls.face_url, faceBlob, headers)
      ]);

      setStep('UPLOAD_SELFIE');
    } catch (e) {
      console.error(e);
      setError('Failed to upload ID documents');
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- SELFIE + VERIFY ---------------- */

  const handleSelfieUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelfieBlob(file);
    const reader = new FileReader();
    reader.onload = () => {
      setSelfiePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submitSelfieAndVerify = async () => {
    setLoading(true);
    setStep('VERIFYING');

    try {
      await axios.put(uploadUrls.selfie_url, selfieBlob, {
        headers: { 'Content-Type': 'image/jpeg' }
      });

      const { data } = await axios.post(
        `${CONFIG.API_ENDPOINT}/verify`,
        { kyc_id: kycId }
      );

      setResult(data);
      setStep('RESULT');
    } catch (e) {
      console.error(e);
      setError('Verification failed');
      setStep('RESULT');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('UPLOAD_ID');
    setIdImage(null);
    setIdImageBlob(null);
    setFaceBlob(null);
    setSelfieBlob(null);
    setSelfiePreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="app-container">
      <div className="main-content-layout">

        {/* Left Side: Verification Flow */}
        <section className="verification-side">
          <header className="brand-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{ width: '48px', height: '48px', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.2)', boxShadow: '0 0 20px rgba(99, 102, 241, 0.2)' }}>
                <ShieldCheck size={28} style={{ margin: 'auto' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h1 className="text-3xl font-black text-white tracking-tighter m-0 uppercase leading-none">Identity <span className="text-indigo-500">Vault</span></h1>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2">Biometric Verification Node</p>
              </div>
            </div>

            {/* Progress Stepper */}
            <div className="stepper-container">
              <div className="stepper-line" />
              {[
                { id: 'UPLOAD_ID', icon: <Upload size={14} />, label: 'ID' },
                { id: 'EXTRACT_FACE', icon: <Camera size={14} />, label: 'Face' },
                { id: 'UPLOAD_SELFIE', icon: <Camera size={14} />, label: 'Selfie' },
                { id: 'RESULT', icon: <CheckCircle2 size={14} />, label: 'Done' }
              ].map((s, i) => {
                const isCompleted = (['SUBMIT_ID', 'UPLOAD_SELFIE', 'VERIFYING', 'RESULT'].includes(step) && i < 2) || (['UPLOAD_SELFIE', 'VERIFYING', 'RESULT'].includes(step) && i < 3) || (step === 'RESULT' && i < 4);
                const isActive = step.includes(s.id) || (step === 'SUBMIT_ID' && s.id === 'EXTRACT_FACE');
                return (
                  <div key={s.id} className="step-item">
                    <div className={`step-bubble ${isCompleted ? 'completed' : isActive ? 'active' : ''}`}>
                      {isCompleted ? <Check size={14} /> : s.icon}
                    </div>
                    <span className={`step-label ${isActive || isCompleted ? 'active' : ''}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </header>

          <main style={{ width: '100%', maxWidth: '500px' }}>
            <AnimatePresence mode="wait">

              {/* STEP 1: UPLOAD ID */}
              {step === 'UPLOAD_ID' && (
                <motion.div
                  key="step-id"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-card text-center"
                >
                  <div className="mb-8">
                    <div className="w-48 h-32 bg-indigo-500/5 rounded-2xl flex flex-col items-center justify-center text-indigo-400 mx-auto mb-6 border border-dashed border-indigo-500/20">
                      <Upload size={32} className="mb-2" />
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Drop ID Document</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Upload Identity Card</h2>
                    <p className="text-gray-400 text-sm">Please provide a clear image of your Passport or Driver's License.</p>
                  </div>

                  <button onClick={() => idInputRef.current.click()} className="primary-button w-full flex items-center justify-center gap-3 py-4">
                    <Upload size={18} /> Select Document
                  </button>
                  <input ref={idInputRef} hidden type="file" accept="image/*" onChange={handleIdUpload} />
                </motion.div>
              )}

              {/* STEP 2: EXTRACT FACE */}
              {step === 'EXTRACT_FACE' && (
                <motion.div
                  key="step-extract"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="glass-card text-center"
                >
                  <div className="relative mb-8 aspect-video overflow-hidden rounded-2xl border border-white/10">
                    <img src={idImage} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-indigo-500/10 mix-blend-overlay" />
                  </div>

                  <div className="mb-8">
                    <h2 className="text-xl font-bold text-white mb-2">Biometric Scan</h2>
                    <p className="text-gray-400 text-sm">Now we need to extract the facial data from your document.</p>
                  </div>

                  <button onClick={() => setShowCropper(true)} className="primary-button w-full flex items-center justify-center gap-3 py-4">
                    <Camera size={18} /> Start Face Extraction
                  </button>
                </motion.div>
              )}

              {/* STEP 3: SUBMIT ID + FACE */}
              {step === 'SUBMIT_ID' && (
                <motion.div
                  key="step-submit-id"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-card text-center"
                >
                  <div className="mb-8">
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400 mx-auto mb-6 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                      <CheckCircle2 size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Extraction Successful</h2>
                    <p className="text-gray-400 text-sm">Your biometric data is ready. We will now securely store it in the encrypted vault.</p>
                  </div>

                  <button onClick={submitIdAndFace} disabled={loading} className="primary-button w-full flex items-center justify-center gap-3 py-4">
                    {loading ? <Loader2 className="animate-spin" /> : <><CloudUpload size={18} /> Finalize ID Submission</>}
                  </button>
                </motion.div>
              )}

              {/* STEP 4: UPLOAD SELFIE */}
              {step === 'UPLOAD_SELFIE' && (
                <motion.div
                  key="step-selfie"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card text-center"
                >
                  <div className="mb-8">
                    <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 mx-auto mb-6 border border-indigo-500/20">
                      <Camera size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Live Verification</h2>
                    <p className="text-gray-400 text-sm">Please take a clear selfie to prove you are the owner of the ID document.</p>
                  </div>

                  {selfiePreview ? (
                    <div className="mb-8 flex justify-center">
                      <div className="relative">
                        <img src={selfiePreview} className="w-44 h-44 object-cover rounded-full border-4 border-indigo-600 shadow-[0_0_40px_rgba(79,70,229,0.3)]" />
                        <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-2 rounded-full border-4 border-[#0f0f12]">
                          <Check size={16} />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    <button onClick={() => selfieInputRef.current.click()} className="secondary-button w-full flex items-center justify-center gap-3 py-4">
                      <Camera size={18} /> {selfieBlob ? 'Retake Selfie' : 'Upload Live Selfie'}
                    </button>
                    <input hidden ref={selfieInputRef} type="file" accept="image/*" onChange={handleSelfieUpload} />

                    {selfieBlob && (
                      <button onClick={submitSelfieAndVerify} className="primary-button w-full flex items-center justify-center gap-3 py-4 shadow-[0_15px_30px_rgba(99,102,241,0.2)] animate-pulse">
                        Verify & Finish <ArrowRight size={18} />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* STEP 5: VERIFYING */}
              {step === 'VERIFYING' && (
                <motion.div
                  key="step-verifying"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-card text-center py-12"
                >
                  <div className="relative flex items-center justify-center mb-10">
                    <div className="absolute inset-0 flex items-center justify-center opacity-20">
                      <div className="w-32 h-32 border-4 border-indigo-500/40 rounded-full animate-ping" />
                    </div>
                    <Loader2 className="animate-spin text-indigo-500" size={64} />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">Biometric Analysis in Progress</h2>
                  <p className="text-gray-400">AWS Rekognition is comparing facial structures and validating authenticity...</p>
                </motion.div>
              )}

              {/* STEP 6: RESULT */}
              {step === 'RESULT' && (
                <motion.div
                  key="step-result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card text-center"
                >
                  {result?.face_match ? (
                    <div className="mb-8">
                      <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-6 border border-emerald-500/20">
                        <CheckCircle2 size={48} />
                      </div>
                      <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">Identity Verified</h2>
                      <div className="bg-emerald-500/10 inline-block px-4 py-2 rounded-full border border-emerald-500/20 text-emerald-400 font-mono text-lg mb-6">
                        {result.similarity.toFixed(1)}% Match
                      </div>

                      {/* NEW: Structured Field Display */}
                      {result.extracted_data && (
                        <div className="mt-8 mb-8 text-left bg-black/40 rounded-2xl border border-white/5 p-6 space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2 border-b border-indigo-500/20 pb-2">Verified Identity Data</h3>

                          <div className="grid grid-cols-1 gap-4">
                            <div className="group">
                              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Full Name</span>
                              <p className="text-sm font-mono text-white group-hover:text-indigo-400 transition-colors uppercase">{result.extracted_data.name}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="group">
                                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Date of Birth</span>
                                <p className="text-sm font-mono text-white group-hover:text-indigo-400 transition-colors">{result.extracted_data.dob}</p>
                              </div>
                              <div className="group">
                                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Document ID</span>
                                <p className="text-sm font-mono text-white group-hover:text-indigo-400 transition-colors">{result.extracted_data.id_number}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <p className="text-gray-400 text-sm">Biometric comparison successfully confirmed your identity. Your access is now active.</p>
                    </div>
                  ) : (
                    <div className="mb-8">
                      <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6 border border-red-500/20">
                        <AlertCircle size={48} />
                      </div>
                      <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">Access Denied</h2>
                      <p className="text-red-400 font-bold mb-4 uppercase tracking-widest text-xs">Biometric verification failed.</p>

                      {/* Partial Data for failed cases if needed, but usually better to stay vague */}
                      <p className="text-gray-400 text-sm">The live selfie does not match the image extracted from the ID. Please try again in better lighting.</p>
                    </div>
                  )}

                  {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-medium">
                      {error}
                    </div>
                  )}

                  <button onClick={reset} className="secondary-button w-full flex items-center justify-center gap-3 py-4">
                    <RefreshCcw size={18} /> Restart Process
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {showCropper && createPortal(
              <FaceCropper
                image={idImage}
                onCropComplete={onCropComplete}
                onCancel={() => setShowCropper(false)}
              />,
              document.body
            )}

          </main>
        </section>

        {/* Right Side: Premium Illustration */}
        <section className="illustration-side">
          <div className="illustration-glow" />
          <div className="illustration-container">
            <img src="/kyc-illustration.png" alt="Identity Vault" />
          </div>
        </section>

      </div>
    </div>
  );
}

export default App;
