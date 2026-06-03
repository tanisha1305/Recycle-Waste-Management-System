import { useState, useEffect } from 'react';
import { X, Truck, Save, Play, Lock, Edit } from 'lucide-react';
import { Shipment } from '../types';
import StageProgressTracker from './StageProgressTracker';
import ProcessingStageModal from './ProcessingStageModal';
import { formatKenyanNumber } from '../utils/numberFormat';

interface ReceiverUpdateModalProps {
  shipment: Shipment;
  onClose: () => void;
  onUpdate: (shipment: Shipment) => void;
  updating?: boolean;
}

export default function ReceiverUpdateModal({
  shipment,
  onClose,
  onUpdate,
  updating = false,
}: ReceiverUpdateModalProps) {
  const [receivedKg, setReceivedKg] = useState(
    shipment.receivedKg?.toString() || ''
  );
  const [showStageModal, setShowStageModal] = useState<1 | 2 | 3 | 4 | null>(null);
  const [isEditingStage, setIsEditingStage] = useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showStageModal) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showStageModal]);

  const isReceiptStep = shipment.status === 'sent';
  const hasReceived = shipment.status !== 'sent';
  const isCompleted = shipment.status === 'completed';

  const handleReceiptSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const received = parseFloat(receivedKg);
    if (!received || received <= 0 || received > shipment.sentKg) {
      alert('Please enter a valid received quantity');
      return;
    }

    const transportLoss = shipment.sentKg - received;
    const transportLossPercent = (transportLoss / shipment.sentKg) * 100;
    const transportLossMoney = transportLoss * shipment.ratePerKg;

    const updatedShipment: Shipment = {
      ...shipment,
      receivedKg: received,
      transportLoss,
      transportLossPercent,
      transportLossMoney,
      status: 'received',
      currentStage: 1,
      cumulativeLossKg: transportLoss,
      cumulativeLossPercent: transportLossPercent,
      cumulativeLossMoney: transportLossMoney,
    };

    onUpdate(updatedShipment);
  };

  const handleStageComplete = (updatedShipment: Shipment) => {
    onUpdate(updatedShipment);
    setShowStageModal(null);
    setIsEditingStage(false);
  };

  const handleEditStage = (stageNum: 1 | 2 | 3 | 4) => {
    setShowStageModal(stageNum);
    setIsEditingStage(true);
  };

  const canStartStage = (stageNum: 1 | 2 | 3 | 4): boolean => {
    if (!hasReceived) return false;
    if (isCompleted) return false;
    
    // Stage 1 can start after receipt
    if (stageNum === 1) {
      return !shipment.processingStages?.stage1_sorting;
    }
    
    // Other stages need previous stage completed
    const prevStageKeys = {
      2: 'stage1_sorting' as const,
      3: 'stage2_crushing' as const,
      4: 'stage3_washing' as const,
    };
    
    const prevKey = prevStageKeys[stageNum as 2 | 3 | 4];
    return !!shipment.processingStages?.[prevKey];
  };

  const getStageStatus = (stageNum: 1 | 2 | 3 | 4): 'completed' | 'available' | 'locked' => {
    const stageKeys = {
      1: 'stage1_sorting' as const,
      2: 'stage2_crushing' as const,
      3: 'stage3_washing' as const,
      4: 'stage4_pelleting' as const,
    };
    
    if (shipment.processingStages?.[stageKeys[stageNum]]) return 'completed';
    if (canStartStage(stageNum)) return 'available';
    return 'locked';
  };

  const stages = [
    { number: 1, name: 'Sorting', description: 'Sort and grade material quality' },
    { number: 2, name: 'Crushing', description: 'Crush material into smaller pieces' },
    { number: 3, name: 'Washing', description: 'Wash and clean the material' },
    { number: 4, name: 'Pelleting', description: 'Create finished pellets' },
  ] as const;

  const canSubmit = isReceiptStep && receivedKg && parseFloat(receivedKg) > 0 && parseFloat(receivedKg) <= shipment.sentKg;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-[9999]" style={{ margin: 0 }}>
        <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto elev-3">
          {/* Header */}
          <div className="sticky top-0 bg-surface/95 px-6 py-4 flex items-center justify-between elev-1">
            <div>
              <h2 className="text-2xl font-bold text-text">
                {isReceiptStep ? 'Receive Shipment' : 'Processing Stages'}
              </h2>
              <p className="text-sm text-muted mt-1">From: {shipment.supplier} → To: {shipment.receiver}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface/50 rounded-lg transition-smooth">
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Shipment Info */}
            <div className="bg-surface/50 rounded-lg p-4">
              <p className="text-sm text-muted mb-2">Sent by Supplier</p>
              <p className="text-2xl font-bold text-text">{formatKenyanNumber(shipment.sentKg, 2)} KG</p>
              <p className="text-xs text-muted mt-1">Material: {shipment.materialType || 'Not specified'}</p>
            </div>

            {/* Receipt Step */}
            {isReceiptStep && (
              <form onSubmit={handleReceiptSubmit}>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-blue-600">
                    <Truck className="w-6 h-6" />
                    <h3 className="text-lg font-semibold">Receipt Details</h3>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text mb-2">
                      Received Weight (KG) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="receivedKg"
                      type="number"
                      step="0.01"
                      value={receivedKg}
                      onChange={(e) => setReceivedKg(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canSubmit) {
                          e.preventDefault();
                          handleReceiptSubmit(e as React.FormEvent);
                        }
                      }}
                      className="w-full px-4 py-3 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                      placeholder="e.g., 80"
                      max={shipment.sentKg}
                      required
                    />
                    <p className="text-xs text-muted mt-1">Actual weight received after transport</p>
                  </div>

                  {receivedKg && parseFloat(receivedKg) > 0 && (
                    <div className="bg-surface/50 border border-accent/20 rounded-lg p-4">
                      <p className="text-sm font-semibold text-accent mb-3">Transport Loss</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted mb-1">Weight Loss</p>
                          <p className="text-lg font-bold text-orange-600">
                            {formatKenyanNumber(shipment.sentKg - parseFloat(receivedKg), 2)} KG
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted mb-1">Loss %</p>
                          <p className="text-lg font-bold text-orange-600">
                            {formatKenyanNumber(((shipment.sentKg - parseFloat(receivedKg)) / shipment.sentKg) * 100, 2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted mb-1">Money Loss</p>
                          <p className="text-lg font-bold text-red-600">
                            KSH {formatKenyanNumber((shipment.sentKg - parseFloat(receivedKg)) * shipment.ratePerKg, 2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit || updating}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 btn-gradient disabled:opacity-50"
                  >
                    {updating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Confirm Receipt & Start Processing
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Processing Stages */}
            {hasReceived && (
              <div className="space-y-6">
                {/* Progress Tracker */}
                <StageProgressTracker shipment={shipment} />

                {/* Stage Action Buttons */}
                <div>
                  <h3 className="text-lg font-semibold text-text mb-4">Processing Stages</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stages.map((stage) => {
                      const status = getStageStatus(stage.number);
                      const stageKeys: { [key: number]: keyof NonNullable<Shipment['processingStages']> } = {
                        1: 'stage1_sorting',
                        2: 'stage2_crushing',
                        3: 'stage3_washing',
                        4: 'stage4_pelleting',
                      };
                      const stageKey = stageKeys[stage.number];
                      const stageData = shipment.processingStages?.[stageKey];

                      return (
                        <div
                          key={stage.number}
                          className={`card p-4 ${
                            status === 'completed'
                              ? 'border'
                              : status === 'available'
                              ? 'bg-blue-50 border border-blue-200'
                              : 'bg-gray-50 border border-gray-200 opacity-60'
                          }`}
                          style={status === 'completed' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' } : {}}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xl font-bold text-primary">{stage.number}</span>
                              </div>
                              <div>
                                <h4 className="font-semibold text-text">Stage {stage.number}: {stage.name}</h4>
                                <p className="text-xs text-muted">{stage.description}</p>
                              </div>
                            </div>
                          </div>

                          {stageData && (
                            <div className="bg-white rounded p-3 mb-3 space-y-2">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-xs font-semibold text-muted">Stage Details</h5>
                                <button
                                  onClick={() => handleEditStage(stage.number)}
                                  className="p-1 hover:bg-blue-50 rounded transition-smooth group"
                                  title="Edit stage output"
                                >
                                  <Edit className="w-3.5 h-3.5 text-blue-600 group-hover:text-blue-700" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <p className="text-muted">Output</p>
                                  <p className="font-bold text-text">{formatKenyanNumber(stageData.outputKg, 2)} KG</p>
                                </div>
                                <div>
                                  <p className="text-muted">Loss</p>
                                  <p className="font-bold text-red-600">{formatKenyanNumber(stageData.lossKg, 2)} KG ({formatKenyanNumber(stageData.lossPercent, 1)}%)</p>
                                </div>
                              </div>
                              {stageData.operator && (
                                <div className="text-xs">
                                  <p className="text-muted">Operator</p>
                                  <p className="font-medium text-text">{stageData.operator}</p>
                                </div>
                              )}
                              {stageData.notes && (
                                <div className="text-xs">
                                  <p className="text-muted">Notes</p>
                                  <p className="text-text">{stageData.notes}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => {
                              if (status === 'available') {
                                setShowStageModal(stage.number);
                                setIsEditingStage(false);
                              }
                            }}
                            disabled={status !== 'available'}
                            className={`w-full py-2 px-4 rounded-lg font-medium transition-smooth flex items-center justify-center gap-2 ${
                              status === 'completed'
                                ? 'text-white cursor-default'
                                : status === 'available'
                                ? 'text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                            style={status === 'completed' ? { backgroundColor: '#10b981' } : status === 'available' ? { backgroundColor: '#10b981' } : {}}
                            onMouseEnter={(e) => status === 'available' && (e.currentTarget.style.backgroundColor = '#059669')}
                            onMouseLeave={(e) => status === 'available' && (e.currentTarget.style.backgroundColor = '#10b981')}
                          >
                            {status === 'completed' ? (
                              <>✓ Completed</>
                            ) : status === 'available' ? (
                              <>
                                <Play className="w-4 h-4" />
                                Start {stage.name}
                              </>
                            ) : (
                              <>
                                <Lock className="w-4 h-4" />
                                Locked
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-surface/95 border-t border-surface/40 px-6 py-4 flex items-center justify-between elev-1">
            <button type="button" onClick={onClose} className="px-6 py-2 text-muted hover:text-text font-medium transition-smooth">
              Close
            </button>
            {isCompleted && (
              <div className="px-4 py-2 rounded-lg font-medium" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                ✓ All Stages Completed
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stage Processing Modal */}
      {showStageModal && (
        <ProcessingStageModal
          shipment={shipment}
          stageNumber={showStageModal}
          onClose={() => {
            setShowStageModal(null);
            setIsEditingStage(false);
          }}
          onSubmit={handleStageComplete}
          isEditMode={isEditingStage}
        />
      )}
    </>
  );
}
