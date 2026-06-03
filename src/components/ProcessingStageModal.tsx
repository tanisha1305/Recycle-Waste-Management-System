import { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { Shipment, ProcessingStageData, InventoryItem } from '../types';
import InventoryForm from './InventoryForm';
import { formatKenyanNumber } from '../utils/numberFormat';
import { 
  subscribeToInventoryItems, 
  updateInventoryItem, 
  addInventoryItem 
} from '../services/inventoryService';
import type { InventoryItem as FirebaseInventoryItem } from '../services/inventoryService';

interface ProcessingStageModalProps {
  shipment: Shipment;
  stageNumber: 1 | 2 | 3 | 4;
  onClose: () => void;
  onSubmit: (updatedShipment: Shipment) => void;
  isEditMode?: boolean; // If true, editing an existing completed stage
}

const stageConfig = {
  1: { name: 'Sorting', key: 'stage1_sorting' as const, color: 'blue' },
  2: { name: 'Crushing', key: 'stage2_crushing' as const, color: 'purple' },
  3: { name: 'Washing', key: 'stage3_washing' as const, color: 'cyan' },
  4: { name: 'Pelleting', key: 'stage4_pelleting' as const, color: 'green' },
};

export default function ProcessingStageModal({
  shipment,
  stageNumber,
  onClose,
  onSubmit,
  isEditMode = false,
}: ProcessingStageModalProps) {
  const config = stageConfig[stageNumber];
  
  // Determine input KG based on previous stage
  const getInputKg = (): number => {
    if (stageNumber === 1) {
      return shipment.receivedKg || shipment.sentKg;
    }
    const prevStageKey = stageConfig[stageNumber - 1 as 1 | 2 | 3].key;
    return shipment.processingStages?.[prevStageKey]?.outputKg || 0;
  };

  const inputKg = getInputKg();
  
  // Get existing stage data if in edit mode
  const existingStageData = isEditMode ? shipment.processingStages?.[config.key] : null;
  
  const [outputKg, setOutputKg] = useState<string>(existingStageData?.outputKg?.toString() || '');
  const [operator, setOperator] = useState<string>(existingStageData?.operator || '');
  const [notes, setNotes] = useState<string>(existingStageData?.notes || '');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(existingStageData?.inventoryItems || []);

  // Handle ESC key to close modal
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, nextFieldId?: string) => {
    if (e.key === 'Enter' && nextFieldId) {
      e.preventDefault();
      const nextField = document.getElementById(nextFieldId);
      if (nextField) {
        nextField.focus();
      }
    }
  };

  const calculateLoss = () => {
    const output = parseFloat(outputKg) || 0;
    const loss = inputKg - output;
    const lossPercent = inputKg > 0 ? (loss / inputKg) * 100 : 0;
    const lossMoney = loss * shipment.ratePerKg;
    return { loss, lossPercent, lossMoney };
  };

  const { loss, lossPercent, lossMoney } = calculateLoss();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const output = parseFloat(outputKg);
    if (!output || output <= 0 || output > inputKg) {
      alert('Please enter a valid output quantity');
      return;
    }

    // Stage 4: Validate inventory items match output weight
    if (stageNumber === 4) {
      const totalInventoryWeight = inventoryItems.reduce((sum, item) => sum + (item.estimatedWeight || 0), 0);
      const weightDifference = Math.abs(output - totalInventoryWeight);
      
      if (weightDifference > 0.5) {
        const confirmProceed = confirm(
          `Warning: Inventory weight (${formatKenyanNumber(totalInventoryWeight, 2)} KG) doesn't match output weight (${formatKenyanNumber(output, 2)} KG).\n\nDo you want to proceed anyway?`
        );
        if (!confirmProceed) return;
      }
      
      if (inventoryItems.length === 0) {
        alert('Please add at least one inventory item for Stage 4');
        return;
      }
    }

    // Handle Stage 4 inventory adjustments if in edit mode
    if (isEditMode && stageNumber === 4 && existingStageData?.inventoryItems) {
      try {
        // Get existing inventory from Firebase
        const firebaseInventoryItems: FirebaseInventoryItem[] = await new Promise((resolve, reject) => {
          const unsubscribe = subscribeToInventoryItems(
            (items) => {
              unsubscribe();
              resolve(items);
            },
            (error) => {
              unsubscribe();
              reject(error);
            }
          );
        });

        const masterInventoryMap = new Map<string, FirebaseInventoryItem>();
        firebaseInventoryItems.forEach(item => {
          const key = item.itemCode.toUpperCase().trim();
          masterInventoryMap.set(key, item);
        });

        // First, reverse the old inventory additions
        for (const oldItem of existingStageData.inventoryItems) {
          if (!oldItem.itemCode || !oldItem.estimatedWeight) continue;
          
          const oldWeight = Number(oldItem.estimatedWeight);
          const itemCodeKey = oldItem.itemCode.toUpperCase().trim();
          const masterItem = masterInventoryMap.get(itemCodeKey);

          if (masterItem && oldWeight > 0) {
            // Subtract the old weight
            const newBalance = masterItem.openingBalance - oldWeight;
            const newInBalance = (masterItem.inBalance || 0) - oldWeight;
            const newTotalBalance = newBalance - (masterItem.outBalance || 0);
            
            console.log(`Edit Mode: Reversing old inventory for ${masterItem.itemCode}`);
            console.log(`  Removing: ${oldWeight} KG`);
            console.log(`  New Balance: ${newBalance} KG`);
            
            await updateInventoryItem(masterItem.id, {
              openingBalance: Math.max(0, newBalance),
              inBalance: Math.max(0, newInBalance),
              availableQuantity: Math.max(0, newTotalBalance),
              totalBalance: Math.max(0, newTotalBalance),
            });
          }
        }

        // Then, apply the new inventory additions (reuse existing logic below)
        console.log('Edit Mode: Applying new inventory weights');
      } catch (error) {
        console.error('Error reversing old inventory:', error);
        alert('Error adjusting inventory. Please try again.');
        return;
      }
    }

    const stageData: ProcessingStageData = {
      stageNumber,
      stageName: config.name as 'Sorting' | 'Crushing' | 'Washing' | 'Pelleting',
      inputKg,
      outputKg: output,
      lossKg: loss,
      lossPercent,
      lossMoney,
      operator: operator || undefined,
      notes: notes || undefined,
      completedAt: existingStageData?.completedAt || new Date().toISOString(),
      ...(stageNumber === 4 && { inventoryItems }),
    };

    // Handle cascade effect when editing earlier stages
    const existingStages = shipment.processingStages || {};
    let allStages = { ...existingStages, [config.key]: stageData };
    
    // If editing an earlier stage and output changed, recalculate subsequent stages
    if (isEditMode && existingStageData && existingStageData.outputKg !== output) {
      console.log(`Edit Mode: Output changed from ${existingStageData.outputKg} to ${output} KG`);
      
      // Check if any subsequent stage has output > new input
      const hasInvalidSubsequentStages = [
        { num: 2, key: 'stage2_crushing' as const, prev: 'stage1_sorting' as const },
        { num: 3, key: 'stage3_washing' as const, prev: 'stage2_crushing' as const },
        { num: 4, key: 'stage4_pelleting' as const, prev: 'stage3_washing' as const },
      ].some(nextStage => {
        if (nextStage.num > stageNumber && allStages[nextStage.key]) {
          const prevStageOutput = allStages[nextStage.prev]?.outputKg || 0;
          const nextStageOutput = allStages[nextStage.key]!.outputKg;
          return nextStageOutput > prevStageOutput;
        }
        return false;
      });

      if (hasInvalidSubsequentStages) {
        const confirmProceed = confirm(
          `Warning: Changing this output will make subsequent stage outputs invalid (output cannot exceed input).\n\nThis will require you to re-enter subsequent stages. Do you want to proceed?`
        );
        if (!confirmProceed) return;
        
        // Remove invalid subsequent stages
        [
          { num: 2, key: 'stage2_crushing' as const, prev: 'stage1_sorting' as const },
          { num: 3, key: 'stage3_washing' as const, prev: 'stage2_crushing' as const },
          { num: 4, key: 'stage4_pelleting' as const, prev: 'stage3_washing' as const },
        ].forEach(nextStage => {
          if (nextStage.num > stageNumber && allStages[nextStage.key]) {
            const prevStageOutput = allStages[nextStage.prev]?.outputKg || 0;
            const nextStageOutput = allStages[nextStage.key]!.outputKg;
            if (nextStageOutput > prevStageOutput) {
              delete allStages[nextStage.key];
              console.log(`Removed invalid Stage ${nextStage.num}`);
            }
          }
        });
      }
      
      // Recalculate subsequent stages with new input values
      if (stageNumber < 4) {
        const subsequentStages = [
          { num: 2, key: 'stage2_crushing' as const, prev: 'stage1_sorting' as const },
          { num: 3, key: 'stage3_washing' as const, prev: 'stage2_crushing' as const },
          { num: 4, key: 'stage4_pelleting' as const, prev: 'stage3_washing' as const },
        ];

        for (const nextStage of subsequentStages) {
          if (nextStage.num > stageNumber && allStages[nextStage.key]) {
            const prevStageOutput = allStages[nextStage.prev]?.outputKg || 0;
            const currentStageData = allStages[nextStage.key]!;
            
            // Recalculate this stage's loss with new input
            const newInputKg = prevStageOutput;
            const newLossKg = newInputKg - currentStageData.outputKg;
            const newLossPercent = newInputKg > 0 ? (newLossKg / newInputKg) * 100 : 0;
            const newLossMoney = newLossKg * shipment.ratePerKg;
            
            allStages[nextStage.key] = {
              ...currentStageData,
              inputKg: newInputKg,
              lossKg: newLossKg,
              lossPercent: newLossPercent,
              lossMoney: newLossMoney,
            };
            
            console.log(`Recalculated Stage ${nextStage.num}: Input=${newInputKg}, Loss=${newLossKg}`);
          }
        }
      }
    }
    
    // Calculate cumulative loss
    let cumulativeLossKg = shipment.transportLoss || 0;
    let cumulativeLossMoney = shipment.transportLossMoney || 0;
    
    Object.values(allStages).forEach((stage) => {
      if (stage) {
        cumulativeLossKg += stage.lossKg;
        cumulativeLossMoney += stage.lossMoney;
      }
    });

    const receivedKg = shipment.receivedKg || shipment.sentKg;
    const cumulativeLossPercent = receivedKg > 0 ? (cumulativeLossKg / receivedKg) * 100 : 0;

    // Determine next status (only change if not editing, or if stages were removed)
    let newStatus: Shipment['status'] = shipment.status;
    let currentStage: Shipment['currentStage'] = shipment.currentStage;
    
    if (!isEditMode) {
      if (stageNumber === 1) {
        newStatus = 'sorting';
        currentStage = 2;
      } else if (stageNumber === 2) {
        newStatus = 'crushing';
        currentStage = 3;
      } else if (stageNumber === 3) {
        newStatus = 'washing';
        currentStage = 4;
      } else if (stageNumber === 4) {
        newStatus = 'completed';
        currentStage = 'completed';
      }
    } else {
      // When editing, update status based on what stages remain
      if (allStages.stage4_pelleting) {
        newStatus = 'completed';
        currentStage = 'completed';
      } else if (allStages.stage3_washing) {
        newStatus = 'washing';
        currentStage = 4;
      } else if (allStages.stage2_crushing) {
        newStatus = 'crushing';
        currentStage = 3;
      } else if (allStages.stage1_sorting) {
        newStatus = 'sorting';
        currentStage = 2;
      } else {
        newStatus = 'received';
        currentStage = 1;
      }
    }

    const updatedShipment: Shipment = {
      ...shipment,
      processingStages: allStages,
      currentStage,
      status: newStatus,
      inventory: stageNumber === 4 ? inventoryItems : shipment.inventory,
      cumulativeLossKg,
      cumulativeLossPercent,
      cumulativeLossMoney,
      effectiveCostPerKg: output > 0 ? shipment.totalCost / output : shipment.ratePerKg,
      // Update legacy fields for stage 4
      ...(stageNumber === 4 && {
        processedKg: output,
        totalLoss: cumulativeLossKg,
        totalLossPercent: cumulativeLossPercent,
        totalLossMoney: cumulativeLossMoney,
      }),
    };

    // Stage 4: Update Firebase inventory with final output weights
    if (stageNumber === 4 && inventoryItems.length > 0) {
      try {
        // Calculate effective cost per KG (total initial cost / final output after all losses)
        // This is the true cost per KG considering all losses during processing
        const effectiveCostPerKg = output > 0 
          ? shipment.totalCost / output 
          : shipment.ratePerKg;
        
        console.log(`Stage 4: Effective cost per KG = KSH ${effectiveCostPerKg.toFixed(2)}/KG`);
        console.log(`  Initial Cost: KSH ${shipment.totalCost.toFixed(2)}`);
        console.log(`  Final Output: ${output.toFixed(2)} KG`);
        
        // Create a "From Pelleting" Direct Purchase record to track this as an initial inventory entry
        // This ensures the inventory transaction history shows the initial addition
        const { addDirectPurchase } = await import('../services/directPurchaseService');
        
        const pelletingPurchaseItems = inventoryItems.map(item => ({
          itemCode: item.itemCode!,
          itemName: item.itemName || item.itemCode!,
          quantity: item.estimatedWeight || 0,
          unit: 'KG',
          rate: effectiveCostPerKg, // Use effective cost per KG
          taxRate: 0,
          amountExclTax: (item.estimatedWeight || 0) * effectiveCostPerKg,
          taxAmount: 0,
          totalAmount: (item.estimatedWeight || 0) * effectiveCostPerKg
        }));

        await addDirectPurchase({
          supplierCode: 'INTERNAL',
          supplierName: 'From Pelleting Process',
          purchaseDate: new Date().toISOString().split('T')[0],
          invoiceNumber: `PELLETING-${shipment.id.substring(0, 8)}-${Date.now()}`,
          items: pelletingPurchaseItems,
          totalAmount: pelletingPurchaseItems.reduce((sum, item) => sum + item.totalAmount, 0)
        });

        console.log('Created "From Pelleting" purchase record for inventory tracking');
        
        // Get all existing inventory items from Firebase
        const firebaseInventoryItems: FirebaseInventoryItem[] = await new Promise((resolve, reject) => {
          const unsubscribe = subscribeToInventoryItems(
            (items) => {
              unsubscribe();
              resolve(items);
            },
            (error) => {
              unsubscribe();
              reject(error);
            }
          );
        });

        // Group existing inventory by itemCode (case-insensitive) to find master records
        const masterInventoryMap = new Map<string, FirebaseInventoryItem>();
        firebaseInventoryItems.forEach(item => {
          const key = item.itemCode.toUpperCase().trim();
          const existing = masterInventoryMap.get(key);
          
          // Keep the one with the most recent update or largest quantity
          if (!existing || 
              (item.updatedAt && existing.updatedAt && item.updatedAt > existing.updatedAt) ||
              item.openingBalance > existing.openingBalance) {
            masterInventoryMap.set(key, item);
          }
        });

        // Update inventory for each item from Stage 4
        for (const item of inventoryItems) {
          if (!item.itemCode || item.estimatedWeight === undefined || item.estimatedWeight === null) {
            console.warn('Skipping item: missing itemCode or estimatedWeight', item);
            continue;
          }
          
          const weightToAdd = Number(item.estimatedWeight);
          if (isNaN(weightToAdd) || weightToAdd <= 0) {
            console.warn('Skipping item: invalid weight', item);
            continue;
          }
          
          console.log(`Processing item: ${item.itemCode}, weight: ${weightToAdd} KG`);
          
          const itemCodeKey = item.itemCode.toUpperCase().trim();
          const masterItem = masterInventoryMap.get(itemCodeKey);

          if (masterItem) {
            // Update the master inventory record
            const newInBalance = (masterItem.inBalance || 0) + weightToAdd;
            const currentOutBalance = masterItem.outBalance || 0;
            const newAvailableQuantity = newInBalance - currentOutBalance;
            
            // Calculate new average cost if adding more inventory
            const existingValue = (masterItem.inBalance || 0) * (masterItem.costPerKg || 0);
            const addedValue = weightToAdd * effectiveCostPerKg;
            const newTotalValue = existingValue + addedValue;
            const newCostPerKg = newInBalance > 0 ? newTotalValue / newInBalance : effectiveCostPerKg;
            
            console.log(`Stage 4 Complete: Updating master inventory ${masterItem.itemCode}`);
            console.log(`  Previous inBalance: ${masterItem.inBalance || 0} KG`);
            console.log(`  Adding: ${weightToAdd} KG at ${effectiveCostPerKg.toFixed(2)}/KG`);
            console.log(`  New inBalance: ${newInBalance} KG`);
            console.log(`  New average cost: ${newCostPerKg.toFixed(2)}/KG`);
            console.log(`  New total value: KSH ${newTotalValue.toFixed(2)}`);
            console.log(`  Available: ${newAvailableQuantity} KG`);
            
            await updateInventoryItem(masterItem.id, {
              inBalance: newInBalance,
              availableQuantity: newAvailableQuantity,
              totalBalance: newAvailableQuantity,
              costPerKg: newCostPerKg,
              totalValue: newTotalValue,
            });
            console.log(`Successfully updated inventory for ${masterItem.itemCode}`);
          } else {
            // Create new master inventory item
            const itemTotalValue = weightToAdd * effectiveCostPerKg;
            console.log(`Stage 4 Complete: Creating new master inventory ${item.itemCode} with ${weightToAdd} KG at ${effectiveCostPerKg.toFixed(2)}/KG (Total: KSH ${itemTotalValue.toFixed(2)})`);
            
            // Clean shipment ID for display: Keep only 'PELLETING' without random suffix
            const cleanShipmentId = shipment.id.includes('PELLETING') 
              ? 'PELLETING' 
              : shipment.id;
            
            const newItemId = await addInventoryItem({
              itemCode: item.itemCode,
              itemName: item.itemName || item.itemCode,
              itemDescription: item.itemDescription || '',
              openingBalance: 0,
              availableQuantity: weightToAdd,
              inBalance: weightToAdd,
              outBalance: 0,
              totalBalance: weightToAdd,
              unit: 'KG',
              costPerKg: effectiveCostPerKg,
              totalValue: itemTotalValue,
              shipmentId: cleanShipmentId,
              shipmentDate: new Date().toISOString().split('T')[0],
            });
            console.log(`Created new master inventory record with ID: ${newItemId}`);
            
            // Add to map for subsequent items in the same batch
            masterInventoryMap.set(itemCodeKey, {
              id: newItemId,
              itemCode: item.itemCode,
              itemName: item.itemName || item.itemCode,
              itemDescription: item.itemDescription || '',
              openingBalance: weightToAdd,
              availableQuantity: weightToAdd,
              inBalance: weightToAdd,
              outBalance: 0,
              totalBalance: weightToAdd,
              unit: 'KG',
              costPerKg: effectiveCostPerKg,
              totalValue: itemTotalValue,
              shipmentId: shipment.id,
              shipmentDate: new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString(),
            });
          }
        }
        
        console.log(`Stage 4 inventory update completed for ${inventoryItems.length} items`);
      } catch (error) {
        console.error('Error updating inventory:', error);
        alert('Warning: Stage completed but inventory update failed. Please update inventory manually.');
      }
    }

    onSubmit(updatedShipment);
  };

  const canSubmit = outputKg && parseFloat(outputKg) > 0 && parseFloat(outputKg) <= inputKg;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-[9999]" style={{ margin: 0 }}>
      <div className={`card w-full ${stageNumber === 4 ? 'max-w-5xl max-h-[95vh]' : 'max-w-2xl max-h-[90vh]'} overflow-y-auto elev-3`}>
        {/* Header */}
        <div className="sticky top-0 bg-surface/95 px-6 py-4 flex items-center justify-between elev-1 z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">{stageNumber}</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text">
                {isEditMode ? 'Edit ' : ''}Stage {stageNumber}: {config.name}
              </h2>
              <p className="text-sm text-muted mt-1">
                {isEditMode ? 'Update processing details and quantities' : 'Enter processing details and track material loss'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface/50 rounded-lg transition-smooth">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {/* Edit Mode Warning */}
            {isEditMode && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-900">Editing Stage {stageNumber}</p>
                    <p className="text-xs text-yellow-800 mt-1">
                      Changes to output quantity may affect subsequent stages and recalculate all totals.
                      {stageNumber === 4 && ' Inventory adjustments will be applied automatically.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Input Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                <p className="text-sm font-medium text-blue-900">Input Material</p>
              </div>
              <p className="text-2xl font-bold text-text">{formatKenyanNumber(inputKg, 2)} KG</p>
              <p className="text-xs text-muted mt-1">
                {stageNumber === 1 ? 'From Receipt' : `From Stage ${stageNumber - 1}`}
              </p>
            </div>

            {/* Output Quantity */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Output Quantity (KG) <span className="text-red-500">*</span>
              </label>
              <input
                id="outputKg"
                type="number"
                step="0.01"
                value={outputKg}
                onChange={(e) => setOutputKg(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'operator')}
                className="w-full px-4 py-3 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                placeholder={`Output after ${config.name.toLowerCase()}`}
                max={inputKg}
                required
              />
              <p className="text-xs text-muted mt-1">Enter the quantity after {config.name.toLowerCase()}</p>
            </div>

            {/* Loss Calculation Preview */}
            {outputKg && parseFloat(outputKg) > 0 && (
              <div className="bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-orange-900 mb-3">Loss Calculation</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted mb-1">Weight Loss</p>
                    <p className="text-lg font-bold text-orange-600">{formatKenyanNumber(loss, 2)} KG</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted mb-1">Loss %</p>
                    <p className="text-lg font-bold text-orange-600">{formatKenyanNumber(lossPercent, 2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted mb-1">Money Loss</p>
                    <p className="text-lg font-bold text-red-600">KSH {formatKenyanNumber(lossMoney, 2)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Stage 4: Finished Product Specification */}
            {stageNumber === 4 && (
              <div className="border-t border-gray-200 pt-6 mt-6">
                <InventoryForm
                  items={inventoryItems}
                  onChange={setInventoryItems}
                  totalWeightKg={parseFloat(outputKg) || 0}
                />
              </div>
            )}

            {/* Operator */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Operator Name</label>
              <input
                id="operator"
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'notes')}
                className="w-full px-4 py-3 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                placeholder="Operator or supervisor name"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Processing Notes</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                placeholder="Any observations, issues, or comments about this stage..."
                rows={3}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-surface/95 border-t border-surface/40 px-6 py-4 flex items-center justify-between elev-1">
            <button type="button" onClick={onClose} className="px-6 py-2 text-muted hover:text-text font-medium transition-smooth">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit} className="flex items-center gap-2 px-6 py-3 btn-gradient disabled:opacity-50">
              <Save className="w-4 h-4" />
              {isEditMode ? 'Update' : 'Complete'} {config.name}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
