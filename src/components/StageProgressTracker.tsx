import { Check, Clock, ArrowRight } from 'lucide-react';
import { Shipment } from '../types';
import { formatKenyanNumber } from '../utils/numberFormat';

interface StageProgressTrackerProps {
  shipment: Shipment;
}

const stages = [
  { number: 1, name: 'Sorting', key: 'stage1_sorting' as const },
  { number: 2, name: 'Crushing', key: 'stage2_crushing' as const },
  { number: 3, name: 'Washing', key: 'stage3_washing' as const },
  { number: 4, name: 'Pelleting', key: 'stage4_pelleting' as const },
];

export default function StageProgressTracker({ shipment }: StageProgressTrackerProps) {
  const currentStageNum = shipment.currentStage === 'completed' ? 5 : (shipment.currentStage || 1);
  
  const isStageCompleted = (stageNum: number) => {
    if (shipment.status === 'completed') return true;
    if (!shipment.processingStages) return false;
    const stage = stages[stageNum - 1];
    return !!shipment.processingStages[stage.key];
  };

  const isCurrentStage = (stageNum: number) => {
    return currentStageNum === stageNum;
  };

  return (
    <div className="card p-6 elev-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text">Processing Progress</h3>
        {shipment.status === 'completed' && (
          <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            ✓ Completed
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const completed = isStageCompleted(stage.number);
          const current = isCurrentStage(stage.number);
          const stageData = shipment.processingStages?.[stage.key];

          return (
            <div key={stage.number} className="flex items-center flex-1">
              {/* Stage Circle */}
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`
                    w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all
                    ${completed 
                      ? 'text-white shadow-lg' 
                      : current 
                      ? 'text-white shadow-lg animate-pulse' 
                      : 'bg-gray-200 text-gray-400'
                    }
                  `}
                  style={completed ? { backgroundColor: '#10b981' } : current ? { backgroundColor: '#10b981' } : {}}
                >
                  {completed ? <Check className="w-8 h-8" /> : stage.number}
                </div>
                
                <div className="mt-2 text-center">
                  <p className={`text-sm font-medium ${current ? '' : completed ? '' : 'text-muted'}`} style={completed ? { color: '#10b981' } : current ? { color: '#10b981' } : {}}>
                    {stage.name}
                  </p>
                  {stageData && (
                    <div className="text-xs text-muted mt-1">
                      <p>{formatKenyanNumber(stageData.outputKg, 2)} KG</p>
                      <p className="text-red-500">-{formatKenyanNumber(stageData.lossPercent, 1)}%</p>
                    </div>
                  )}
                  {current && !completed && (
                    <div className="flex items-center justify-center gap-1 mt-1 text-xs" style={{ color: '#10b981' }}>
                      <Clock className="w-3 h-3" />
                      <span>In Progress</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow between stages */}
              {index < stages.length - 1 && (
                <ArrowRight 
                  className={`w-6 h-6 mx-2 mt-[-40px] ${
                    completed ? '' : 'text-gray-300'
                  }`}
                  style={completed ? { color: '#10b981' } : {}}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Cumulative Loss Summary */}
      {shipment.cumulativeLossKg !== undefined && shipment.cumulativeLossKg > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted mb-1">Total Loss</p>
              <p className="text-lg font-bold text-red-600">{formatKenyanNumber(shipment.cumulativeLossKg, 2)} KG</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-1">Loss Percentage</p>
              <p className="text-lg font-bold text-orange-600">{formatKenyanNumber(shipment.cumulativeLossPercent || 0, 2)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-1">Loss Cost</p>
              <p className="text-lg font-bold text-red-600">KSH {formatKenyanNumber(shipment.cumulativeLossMoney || 0, 2)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
