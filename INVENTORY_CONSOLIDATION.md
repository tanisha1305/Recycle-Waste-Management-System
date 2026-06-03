# Inventory Consolidation System

## Overview
The inventory system has been updated to properly consolidate quantities across multiple shipments. Instead of creating separate inventory records for each shipment, the system now maintains a single master record per item code.

## How It Works

### Stage 4 Pelleting → Inventory Update Flow

When Stage 4 (Pelleting) is completed for a shipment:

1. **Master Record Detection**
   - System queries all existing inventory items from Firestore
   - Groups items by `itemCode` (case-insensitive) to identify master records
   - If multiple records exist for same itemCode, keeps the most recently updated or largest quantity one

2. **Quantity Consolidation**
   - For **existing items**: Adds the new weight to the master record's balances
   - For **new items**: Creates a new master inventory record
   
3. **Balance Calculations**
   ```
   openingBalance = previousBalance + newWeight
   inBalance = previousInBalance + newWeight
   totalBalance = openingBalance - outBalance
   availableQuantity = totalBalance
   ```

### Example Scenario

**Shipment 1 - Stage 4 Complete:**
- Item: BLOW YELLOW
- Weight: 500 KG
- **Result**: New inventory record created
  ```
  itemCode: BLOW YELLOW
  openingBalance: 500 KG
  inBalance: 500 KG
  outBalance: 0 KG
  totalBalance: 500 KG
  availableQuantity: 500 KG
  ```

**Shipment 2 - Stage 4 Complete:**
- Item: BLOW YELLOW
- Weight: 300 KG
- **Result**: Master record updated (NO new record created)
  ```
  itemCode: BLOW YELLOW
  openingBalance: 800 KG  (500 + 300)
  inBalance: 800 KG       (500 + 300)
  outBalance: 0 KG
  totalBalance: 800 KG    (800 - 0)
  availableQuantity: 800 KG
  ```

**Shipment 3 - Stage 4 Complete:**
- Item: BLOW YELLOW
- Weight: 200 KG
- **Result**: Master record updated again
  ```
  itemCode: BLOW YELLOW
  openingBalance: 1000 KG  (800 + 200)
  inBalance: 1000 KG       (800 + 200)
  outBalance: 0 KG
  totalBalance: 1000 KG    (1000 - 0)
  availableQuantity: 1000 KG
  ```

## Inventory Fields Explained

| Field | Description |
|-------|-------------|
| `itemCode` | Unique identifier for the item (e.g., "BLOW YELLOW") |
| `itemName` | Display name for the item |
| `openingBalance` | Total quantity received into inventory (cumulative) |
| `inBalance` | Total quantity added (same as openingBalance for now) |
| `outBalance` | Total quantity removed/sold (for future use) |
| `totalBalance` | Net quantity (openingBalance - outBalance) |
| `availableQuantity` | Currently available stock (same as totalBalance) |
| `unit` | Measurement unit (always "KG" for pelleting output) |

## Benefits

1. **Single Source of Truth**: One master record per item code
2. **Accurate Totals**: All shipment quantities properly accumulated
3. **No Duplicates**: Prevents multiple inventory records for same item
4. **Real-time Updates**: Firestore listener reflects changes immediately
5. **Future-Ready**: outBalance field prepared for sales/consumption tracking

## Technical Implementation

### Files Modified
- `src/components/ProcessingStageModal.tsx` - Lines 180-260
- `src/services/inventoryService.ts` - updateInventoryItem function

### Key Changes
1. Master record detection using case-insensitive itemCode matching
2. Balance field calculations (inBalance, totalBalance, availableQuantity)
3. Proper handling of multiple shipments with same items
4. Enhanced error logging for troubleshooting

### Testing
To verify the consolidation:
1. Process Stage 4 for multiple shipments with the same item code
2. Check inventory list - should see only ONE record per item
3. Verify the quantities are cumulative across all shipments
4. Console logs show "Updating master inventory" messages

## Future Enhancements

1. **Stock Adjustments**: Manual add/remove quantities
2. **Sales Tracking**: Update outBalance when items are sold
3. **Low Stock Alerts**: Notifications when availableQuantity is low
4. **Batch Tracking**: Link back to shipment IDs for traceability
5. **Audit Trail**: Log all inventory movements with timestamps

## Migration Note

If you have existing duplicate inventory records:
1. The system will automatically select one as the master record (most recent or largest)
2. New Stage 4 completions will update the master record
3. Old duplicate records remain but won't be updated
4. Consider manual cleanup of old duplicate records if needed
