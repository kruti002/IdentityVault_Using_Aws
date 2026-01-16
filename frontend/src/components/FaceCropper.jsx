import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, Check, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const FaceCropper = ({ image, onCropComplete, onCancel }) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const onCropAreaComplete = useCallback((_, croppedPixels) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const handleSubmit = async () => {
        if (!croppedAreaPixels) return;

        const blob = await getCroppedImg(image, croppedAreaPixels);
        onCropComplete(blob); // closes popup from parent
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.95)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2147483647,
                padding: '20px'
            }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    width: '100%',
                    maxWidth: '450px',
                    backgroundColor: '#0f0f12',
                    borderRadius: '32px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* Header Area */}
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>Extract Face</div>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Cropper Zone - HARD-CODED HEIGHT */}
                <div style={{ position: 'relative', height: '350px', width: '100%', backgroundColor: '#000' }}>
                    <Cropper
                        image={image}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropAreaComplete}
                    />
                </div>

                {/* Controls and THE BUTTON */}
                <div style={{ padding: '32px', backgroundColor: '#18181b', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#999', fontSize: '12px', fontWeight: 'bold' }}>
                            <span>ZOOM</span>
                            <span style={{ color: '#6366f1' }}>{Math.round(zoom * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.01}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            style={{ width: '100%', height: '6px', accentColor: '#6366f1' }}
                        />
                    </div>

                    <button
                        onClick={handleSubmit}
                        style={{
                            width: '100%',
                            backgroundColor: '#6366f1',
                            color: 'white',
                            padding: '18px',
                            borderRadius: '16px',
                            border: 'none',
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            boxShadow: '0 10px 20px rgba(99, 102, 241, 0.3)'
                        }}
                    >
                        <Check size={20} /> Confirm Face Extraction
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default FaceCropper;

/* ---------- Helpers ---------- */

async function getCroppedImg(imageSrc, pixelCrop) {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg');
    });
}

const createImage = (url) =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
