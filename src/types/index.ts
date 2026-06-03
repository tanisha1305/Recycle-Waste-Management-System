export interface InventoryItem {
  id: string;
  itemCode?: string; // Auto-generated unique code (e.g., ITM-001, ITM-002)
  itemName: string;
  itemDescription?: string; // Optional item description
  estimatedWeight?: number; // in kg
}

export interface ProcessingStageData {
  stageNumber: 1 | 2 | 3 | 4;
  stageName: 'Sorting' | 'Crushing' | 'Washing' | 'Pelleting';
  inputKg: number;
  outputKg: number;
  lossKg: number;
  lossPercent: number;
  lossMoney: number;
  operator?: string;
  notes?: string;
  completedAt?: string;
  
  // Stage-specific fields
  inventoryItems?: InventoryItem[]; // Stage 4 only - finished products specification
}

export interface Shipment {
  id: string;
  date: string;
  supplierCode?: string;
  supplier: string;
  purchaseInvoiceNumber?: string; // Purchase invoice number from supplier
  purchaseKg: number;
  materialType?: string;
  ratePerKg: number;
  totalCost: number;
  sentKg: number;
  receiver: string;
  status: 'sent' | 'received' | 'sorting' | 'crushing' | 'washing' | 'pelleting' | 'completed';

  // Delivery Note fields
  deliveryNoteItemCode?: string; // Item code for delivery note
  deliveryNoteText?: string; // Delivery note description/details

  receivedKg?: number;
  transportLoss?: number;
  transportLossPercent?: number;
  transportLossMoney?: number;

  // Legacy fields for backward compatibility
  processedKg?: number;
  processingLoss?: number;
  processingLossPercent?: number;
  processingLossMoney?: number;

  totalLoss?: number;
  totalLossPercent?: number;
  totalLossMoney?: number;
  effectiveCostPerKg?: number;

  // 4-Stage Processing Tracking
  processingStages?: {
    stage1_sorting?: ProcessingStageData;
    stage2_crushing?: ProcessingStageData;
    stage3_washing?: ProcessingStageData;
    stage4_pelleting?: ProcessingStageData;
  };
  
  currentStage?: 1 | 2 | 3 | 4 | 'completed';
  cumulativeLossKg?: number;
  cumulativeLossPercent?: number;
  cumulativeLossMoney?: number;

  // Inventory tracking (populated after sorting)
  inventory?: InventoryItem[];

  // Receipt-specific fields
  batchId?: string;
  photos?: string[]; // data URLs or paths (frontend-only for now)
  approvalStatus?: 'draft' | 'pending' | 'approved' | 'rejected';

  notes?: string;
}

export interface FinishedProduct {
  id: string;
  productCode: string;
  productName: string;
  description?: string;
  currentStock: number; // in KG
  unit: 'KG' | 'Pieces' | 'Bags';
  reorderLevel: number; // Alert threshold
  criticalLevel: number; // Critical alert threshold
  costPerUnit: number; // Average cost
  sellingPricePerUnit?: number;
  createdAt: string;
  lastUpdated: string;
  status: 'in-stock' | 'low-stock' | 'critical' | 'out-of-stock';
  category?: string;
}

export interface StockTransaction {
  id: string;
  productId: string;
  transactionType: 'addition' | 'deduction' | 'adjustment';
  quantity: number; // positive for addition, negative for deduction
  previousStock: number;
  newStock: number;
  reason: string;
  source?: string; // e.g., 'Shipment #123 - Stage 4 Completion', 'Manual Adjustment', 'Sale Order #456'
  performedBy: string; // operator/user name
  approvedBy?: string; // for adjustments
  timestamp: string;
  notes?: string;
}

export interface DebitCreditNote {
  id: string;
  noteNumber: string;
  noteType: 'debit' | 'credit';
  transactionType: 'sale' | 'purchase';
  date: string;
  partyType: 'customer' | 'supplier';
  partyName: string;
  partyCode: string;
  originalInvoiceNumber: string;
  reason: string;
  items: {
    itemCode?: string; // Item code from inventory
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  status: 'draft' | 'issued' | 'cancelled' | 'paid';
  remarks?: string;
  createdAt: string;
}

export type UserRole = 'sender' | 'receiver';

// New role-based access control types
export type SystemRole = 'admin' | 'manager' | 'operator';

export interface User {
  id: string;
  loginId: string;
  password: string; // In production, this should be hashed
  fullName: string;
  email?: string;
  role: SystemRole;
  isActive: boolean;
  createdAt: string;
  createdBy?: string;
  lastLogin?: string;
  permissions: UserPermissions;
}

export interface UserPermissions {
  // Admin permissions - complete system access
  canManageUsers?: boolean;
  canConfigureSystem?: boolean;
  canViewFinancialReports?: boolean;
  canGenerateReports?: boolean;
  
  // Manager/Supervisor permissions
  canMonitorOperations?: boolean;
  canReviewReports?: boolean;
  canApproveActivities?: boolean;
  canOverseeStaff?: boolean;
  canTrackPerformance?: boolean;
  
  // Operator/Staff permissions
  canEnterMaterialReceipt?: boolean;
  canRecordProcessingStages?: boolean;
  canUpdateInventory?: boolean;
  canRecordExpenses?: boolean;
  canUploadDocuments?: boolean;
  
  // Shared permissions
  canViewShipments?: boolean;
  canViewInventory?: boolean;
  canViewDashboard?: boolean;
}

export interface Ledger {
  id: string;
  ledgerCode: string;
  ledgerName: string;
  ledgerGroup: 'Assets' | 'Liabilities' | 'Capital' | 'Income' | 'Expenses' | 'Direct Income' | 'Indirect Income' | 'Direct Expenses' | 'Indirect Expenses';
  ledgerType: 'Balance Sheet' | 'Profit & Loss';
  openingBalance: number;
  currentBalance: number;
  debitTotal: number;
  creditTotal: number;
  isActive: boolean;
  description?: string;
  createdAt: string;
  lastUpdated: string;
}

// Activity Log types for admin tracking
export type ActivityAction = 
  | 'login' 
  | 'logout' 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'view' 
  | 'approve' 
  | 'reject'
  | 'export'
  | 'import'
  | 'configure';

export type ActivityModule = 
  | 'authentication'
  | 'users'
  | 'shipments'
  | 'inventory'
  | 'processing'
  | 'customers'
  | 'suppliers'
  | 'invoices'
  | 'delivery-notes'
  | 'debit-credit-notes'
  | 'transactions'
  | 'ledgers'
  | 'reports'
  | 'settings'
  | 'database';

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: SystemRole;
  action: ActivityAction;
  module: ActivityModule;
  description: string; // Human-readable description of what happened
  details?: {
    itemId?: string;
    itemName?: string;
    previousValue?: any;
    newValue?: any;
    additionalInfo?: Record<string, any>;
  };
  timestamp: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string; // Browser/device info
  duration?: number; // Time taken in milliseconds (for operations)
}

export interface ActivityLogFilter {
  userId?: string;
  action?: ActivityAction;
  module?: ActivityModule;
  status?: 'success' | 'failure';
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
}

// Payment Tracking types
export interface PaymentTransaction {
  id: string;
  date: string;
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName: string;
  partyCode: string;
  transactionType: 'invoice' | 'payment' | 'advance' | 'refund' | 'adjustment';
  referenceType: 'invoice' | 'delivery-note' | 'debit-note' | 'credit-note' | 'direct-payment';
  referenceNumber?: string; // Invoice number, delivery note number, etc.
  amount: number;
  paymentMethod?: 'cash' | 'bank' | 'mobile-money' | 'cheque' | 'other' | 'CR Note' | 'DB Note';
  bankAccountId?: string; // ID of bank account used (when payment method is bank)
  bankAccountName?: string; // Name of bank account (for display)
  transferCharge?: number; // Bank transfer charge (not included in balance calculations)
  paymentReference?: string; // Transaction ID, cheque number, etc.
  contraTransactionId?: string; // ID of corresponding bank/cash transaction (contra entry)
  description: string;
  notes?: string;
  isAdvancePayment?: boolean; // Flag to mark if this is an advance payment
  createdBy: string;
  createdAt: string;
  status: 'pending' | 'completed' | 'cancelled';
}

export interface PartyBalance {
  id: string;
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName: string;
  partyCode: string;
  openingBalance?: number; // Opening balance from customer/supplier record
  totalInvoiced: number; // Total amount invoiced/billed
  totalPaid: number; // Total amount received/paid (actual cash/bank payments only)
  totalAdjustments: number; // Total adjustments (credit/debit notes)
  totalAdvance: number; // Advance payments
  advanceBalance: number; // Remaining advance payment balance after applying to invoices
  balance: number; // Outstanding balance (positive = to receive, negative = to pay)
  lastTransactionDate: string;
  lastUpdated: string;
  status: 'active' | 'settled' | 'overdue';
}

export interface PaymentSummary {
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName: string;
  partyCode: string;
  balance: PartyBalance;
  recentTransactions: PaymentTransaction[];
  invoices: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
  };
}

// Quotation types
export interface QuotationItem {
  itemCode: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amountExclTax: number;
  taxAmount: number;
  amountInclTax: number;
}

export interface Quotation {
  id: string;
  systemQuotationNumber: string; // Auto-generated by system
  manualQuotationNumber: string; // Manually entered
  date: string;
  customerName: string;
  customerPRN: string;
  quotationFrom: {
    pin: string;
    name: string;
    address: string;
    mobile: string;
  };
  items: QuotationItem[];
  taxableTotalAmount: number;
  totalTaxAmount: number;
  totalAmount: number;
  status: 'draft' | 'sent';
  createdAt: string;
}
