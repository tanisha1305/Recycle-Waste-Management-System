import { useState, useEffect } from 'react';
import { X, Camera, Save } from 'lucide-react';
import { Shipment } from '../types';

interface ReceiptFormProps {
  onClose: () => void;
  onSubmit: (shipment: Shipment) => void;
  defaultSupplier?: string;
  saving?: boolean;
}

const MATERIALS = [
  'PP Injection',
  'HDPE Blow',
  'LD',
  'Rafia Pellets',
];

export default function ReceiptForm({ onClose, onSubmit, defaultSupplier, saving = false }: ReceiptFormProps) {
  const [materialType, setMaterialType] = useState<string>(MATERIALS[0]);
  const [supplier, setSupplier] = useState<string>(defaultSupplier || '');
  const [quantityReceived, setQuantityReceived] = useState<string>('');
  const [quantitySent, setQuantitySent] = useState<string>('');
  const [pricePerKg, setPricePerKg] = useState<string>('');
  const [photos, setPhotos] = useState<string[]>([]);

  // Handle ESC key to close form
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle Enter key to move to next field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, nextFieldId?: string) => {
    if (e.key === 'Enter' && nextFieldId) {
      e.preventDefault();
      const nextField = document.getElementById(nextFieldId);
      if (nextField) {
        nextField.focus();
      }
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotos((p) => [reader.result as string, ...p]);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const received = parseFloat(quantityReceived || '0');
    const sent = parseFloat(quantitySent || '0');
    const rate = parseFloat(pricePerKg || '0');

    const transportLoss = sent - received;
    const transportLossPercent = sent > 0 ? (transportLoss / sent) * 100 : 0;
    const transportLossMoney = transportLoss * rate;
    const effectiveCostPerKg = received > 0 ? (sent * rate) / received : rate;

    const shipment: Shipment = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      supplier,
      materialType,
      purchaseKg: sent,
      ratePerKg: rate,
      totalCost: sent * rate,
      sentKg: sent,
      receiver: 'Local Receiver',
      status: 'received',
      receivedKg: received,
      transportLoss,
      transportLossPercent,
      transportLossMoney,
      effectiveCostPerKg,
      batchId: `B-${Date.now()}`,
      photos,
      notes: '',
    };

    onSubmit(shipment);
  };

  const canSubmit = supplier && quantityReceived && quantitySent && pricePerKg && parseFloat(quantityReceived) > 0;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-[9999]" style={{ margin: 0 }}>
      <div className="card modal-card bg-white w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg border" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <Camera className="w-6 h-6" style={{ color: '#10b981' }} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">New Material Receipt</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="relative">
              <div className="leaf-accent" style={{right: -28, top: -40}} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Material Type</label>
              <select 
                id="materialType"
                value={materialType} 
                onChange={(e) => setMaterialType(e.target.value)} 
                onKeyDown={(e) => handleKeyDown(e, 'supplier')}
                className="w-full">
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Supplier</label>
              <input 
                id="supplier"
                value={supplier} 
                onChange={(e) => setSupplier(e.target.value)} 
                onKeyDown={(e) => handleKeyDown(e, 'quantitySent')}
                className="w-full" 
                placeholder="Supplier name or company" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quantity Sent (KG)</label>
                <input 
                  id="quantitySent"
                  type="number" 
                  step="0.01" 
                  value={quantitySent} 
                  onChange={(e) => setQuantitySent(e.target.value)} 
                  onKeyDown={(e) => handleKeyDown(e, 'quantityReceived')}
                  className="w-full" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quantity Received (KG)</label>
                <input 
                  id="quantityReceived"
                  type="number" 
                  step="0.01" 
                  value={quantityReceived} 
                  onChange={(e) => setQuantityReceived(e.target.value)} 
                  onKeyDown={(e) => handleKeyDown(e, 'pricePerKg')}
                  className="w-full" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Price per KG (KSH)</label>
                <input 
                  id="pricePerKg"
                  type="number" 
                  step="0.01" 
                  value={pricePerKg} 
                  onChange={(e) => setPricePerKg(e.target.value)} 
                  className="w-full" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Photos</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer border" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                  <Camera className="w-5 h-5" style={{ color: '#10b981' }} />
                  <span className="text-sm" style={{ color: '#10b981' }}>Upload</span>
                  <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                </label>
                <div className="flex gap-2">
                  {photos.map((p, i) => (
                    <img key={i} src={p} alt={`photo-${i}`} className="w-16 h-16 object-cover rounded-md border" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white/95 border-t border-slate-100 px-6 py-4 flex items-center justify-between">
            <button type="button" onClick={onClose} disabled={saving} className="px-6 py-2 btn-ghost-eco disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={!canSubmit || saving} className="flex items-center gap-2 px-6 py-3 btn-gradient disabled:opacity-60">
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Receipt
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
