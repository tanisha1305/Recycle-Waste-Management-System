import { useState } from 'react';
import { Package, Calendar, User, Truck, Factory, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Shipment } from '../types';
import ReceiverUpdateModal from './ReceiverUpdateModal';
import { updateShipment } from '../services/shipmentService';
import { addTransaction } from '../services/transactionService';
import { Transaction } from './ReceiverPanel';
import { formatKenyanNumber } from '../utils/numberFormat';

interface ReceiverShipmentListProps {
  shipments: Shipment[];
  onUpdateShipment: (shipment: Shipment) => void;
}

export default function ReceiverShipmentList({
  shipments,
  onUpdateShipment,
}: ReceiverShipmentListProps) {
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(
    null
  );
  const [expandedShipments, setExpandedShipments] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);

  const toggleExpand = (shipmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedShipments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(shipmentId)) {
        newSet.delete(shipmentId);
      } else {
        newSet.add(shipmentId);
      }
      return newSet;
    });
  };

  const downloadCSV = () => {
    // Create CSV content
    let csvContent = 'ID,From,To,Date,Invoice,Status,Sent (KG),Rate (KSH/KG),Received (KG),Transport Loss (KG),Transport Loss %,Processed (KG),Processing Loss (KG),Processing Loss %,Total Loss (KG),Total Loss %,Notes\n';
    
    shipments.forEach(shipment => {
      const processingLossKg = ((shipment.cumulativeLossKg || 0) - (shipment.transportLoss || 0));
      const processingLossPercent = ((shipment.cumulativeLossPercent || 0) - (shipment.transportLossPercent || 0));
      
      csvContent += `"${shipment.id}","${shipment.supplier}","${shipment.receiver}","${shipment.date}","${shipment.purchaseInvoiceNumber || ''}","${shipment.status}",${formatKenyanNumber(shipment.sentKg, 2)},${formatKenyanNumber(shipment.ratePerKg, 2)},${shipment.receivedKg ? formatKenyanNumber(shipment.receivedKg, 2) : ''},${shipment.transportLoss ? formatKenyanNumber(shipment.transportLoss, 2) : ''},${shipment.transportLossPercent ? formatKenyanNumber(shipment.transportLossPercent, 2) : ''},${shipment.processedKg ? formatKenyanNumber(shipment.processedKg, 2) : ''},${formatKenyanNumber(processingLossKg, 2)},${formatKenyanNumber(processingLossPercent, 2)},${shipment.cumulativeLossKg ? formatKenyanNumber(shipment.cumulativeLossKg, 2) : ''},${shipment.cumulativeLossPercent ? formatKenyanNumber(shipment.cumulativeLossPercent, 2) : ''},"${(shipment.notes || '').replace(/"/g, '""')}"\n`;
    });

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `shipments_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (shipments.length === 0) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl p-12 sm:p-16 text-center border border-gray-200">
        <Package className="w-16 sm:w-20 h-16 sm:h-20 text-gray-300 mx-auto mb-3 sm:mb-4" />
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1.5 sm:mb-2">No Shipments Available</h3>
        <p className="text-xs sm:text-sm text-gray-500 font-normal">Waiting for senders to create shipments</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: Shipment['status']) => {
    switch (status) {
      case 'sent':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'received':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'sorting':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'crushing':
        return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'washing':
        return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case 'pelleting':
        return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'completed':
        return 'border';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (shipment: Shipment): string => {
    if (shipment.status === 'sent') return 'Pending Receipt';
    if (shipment.status === 'received') return 'Received - Ready to Process';
    if (shipment.status === 'sorting') return 'Stage 1: Sorting';
    if (shipment.status === 'crushing') return 'Stage 2: Crushing';
    if (shipment.status === 'washing') return 'Stage 3: Washing';
    if (shipment.status === 'pelleting') return 'Stage 4: Pelleting';
    if (shipment.status === 'completed') return '✓ All Stages Complete';
    if (shipment.status === 'processed') return 'Processed';
    return shipment.status;
  };

  const downloadPDF = (shipment: Shipment) => {
    const printContent = `
      <html>
        <head>
          <title>Shipment ${shipment.id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              font-size: 11px;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
            }
            .company-name {
              font-size: 22px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .system-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .doc-title {
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .date-info {
              font-size: 10px;
              margin-top: 5px;
            }
            
            .summary-boxes {
              display: flex;
              justify-content: space-between;
              margin: 20px 0;
              gap: 10px;
            }
            .summary-box {
              flex: 1;
              border: 1px solid #000;
              padding: 10px;
              text-align: center;
            }
            .summary-label {
              font-size: 9px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .summary-value {
              font-size: 12px;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
              border: 1px solid #000;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px 5px;
              text-align: left;
              font-size: 10px;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .section-title {
              font-size: 11px;
              font-weight: bold;
              margin: 15px 0 10px 0;
              padding: 5px;
              background-color: #f5f5f5;
              border: 1px solid #000;
            }
            .total-row {
              font-weight: bold;
              background-color: #f5f5f5;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 9px;
              border-top: 1px solid #000;
              padding-top: 10px;
            }
            @media print {
              body { padding: 10px; }
              @page { size: auto; margin: 0mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">DONATO IMPEX LTD.</div>
            <div class="system-name">RECYCLE BUSINESS MANAGER</div>
            <div class="doc-title">Shipment Receipt</div>
            <div class="date-info">Generated on ${new Date().toLocaleDateString('en-GB')}</div>
          </div>
          
          <div class="summary-boxes">
            <div class="summary-box">
              <div class="summary-label">SHIPMENT ID</div>
              <div class="summary-value">${shipment.id}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">DATE</div>
              <div class="summary-value">${formatDate(shipment.date)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">STATUS</div>
              <div class="summary-value">${shipment.status.toUpperCase()}</div>
            </div>
            ${shipment.purchaseInvoiceNumber ? `
            <div class="summary-box">
              <div class="summary-label">PURCHASE INVOICE</div>
              <div class="summary-value">${shipment.purchaseInvoiceNumber}</div>
            </div>
            ` : ''}
          </div>
          
          <div class="section-title">SHIPMENT DETAILS</div>
          <table>
            <tr>
              <th style="width: 25%;">From (Supplier)</th>
              <td><strong>${shipment.supplier}</strong></td>
            </tr>
            <tr>
              <th>To (Receiver)</th>
              <td><strong>${shipment.receiver}</strong></td>
            </tr>
          </table>
          
          <div class="section-title">MATERIAL FLOW</div>
          <table>
            <thead>
              <tr>
                <th style="width: 30%;">Stage</th>
                <th style="width: 25%;" class="text-right">Weight (KG)</th>
                <th style="width: 45%;">Rate / Loss Info</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Purchased</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.sentKg, 2)}</strong></td>
                <td>@ KSH ${formatKenyanNumber(shipment.ratePerKg, 2)}/KG</td>
              </tr>
              ${shipment.receivedKg !== undefined ? `
              <tr>
                <td><strong>Received</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.receivedKg, 2)}</strong></td>
                <td>Transport Loss: ${formatKenyanNumber(shipment.transportLoss || 0, 2)} KG (${formatKenyanNumber(shipment.transportLossPercent || 0, 2)}%)</td>
              </tr>
              ` : ''}
              ${shipment.processedKg !== undefined ? `
              <tr>
                <td><strong>Processed</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.processedKg, 2)}</strong></td>
                <td>Processing Loss: ${formatKenyanNumber((shipment.cumulativeLossKg || 0) - (shipment.transportLoss || 0), 2)} KG (${formatKenyanNumber((shipment.cumulativeLossPercent || 0) - (shipment.transportLossPercent || 0), 2)}%)</td>
              </tr>
              ` : ''}
            </tbody>
          </table>
          
          ${shipment.status === 'completed' ? `
          <div class="section-title">LOSS ANALYSIS</div>
          <table>
            <thead>
              <tr>
                <th style="width: 35%;">Loss Type</th>
                <th style="width: 20%;" class="text-right">Weight (KG)</th>
                <th style="width: 25%;" class="text-right">Money (KSH)</th>
                <th style="width: 20%;" class="text-right">Percentage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Transport Loss</td>
                <td class="text-right">${formatKenyanNumber(shipment.transportLoss || 0, 2)}</td>
                <td class="text-right">${formatKenyanNumber(shipment.transportLossMoney || 0, 2)}</td>
                <td class="text-right">${formatKenyanNumber(shipment.transportLossPercent || 0, 2)}%</td>
              </tr>
              <tr>
                <td>Processing Loss</td>
                <td class="text-right">${formatKenyanNumber((shipment.cumulativeLossKg || 0) - (shipment.transportLoss || 0), 2)}</td>
                <td class="text-right">${formatKenyanNumber((shipment.cumulativeLossMoney || 0) - (shipment.transportLossMoney || 0), 2)}</td>
                <td class="text-right">${formatKenyanNumber((shipment.cumulativeLossPercent || 0) - (shipment.transportLossPercent || 0), 2)}%</td>
              </tr>
              <tr class="total-row">
                <td><strong>TOTAL LOSS</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.cumulativeLossKg || 0, 2)}</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.cumulativeLossMoney || 0, 2)}</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.cumulativeLossPercent || 0, 2)}%</strong></td>
              </tr>
            </tbody>
          </table>
          
          <div class="section-title">COST ANALYSIS</div>
          <div class="summary-boxes">
            <div class="summary-box">
              <div class="summary-label">INITIAL COST</div>
              <div class="summary-value">KSH ${formatKenyanNumber(shipment.sentKg * shipment.ratePerKg, 2)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">LOSS COST</div>
              <div class="summary-value">KSH ${formatKenyanNumber(shipment.cumulativeLossMoney || 0, 2)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">TOTAL COST</div>
              <div class="summary-value">KSH ${formatKenyanNumber((shipment.sentKg * shipment.ratePerKg) + (shipment.cumulativeLossMoney || 0), 2)}</div>
            </div>
            ${shipment.effectiveCostPerKg ? `
            <div class="summary-box">
              <div class="summary-label">EFFECTIVE RATE</div>
              <div class="summary-value">KSH ${formatKenyanNumber(shipment.effectiveCostPerKg, 2)}/KG</div>
            </div>
            ` : ''}
          </div>
          ` : ''}
          
          ${shipment.notes ? `
          <div class="section-title">NOTES</div>
          <div style="border: 1px solid #000; padding: 10px; margin: 10px 0; background-color: #fafafa;">
            ${shipment.notes}
          </div>
          ` : ''}
          
          <div class="footer">
            <p>This is a computer-generated document. No signature required.</p>
            <p style="margin-top: 5px;">Recycle Business Manager - Shipment Management System</p>
          </div>
        </body>
      </html>
    `;

    // Create hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printContent);
      iframeDoc.close();
      
      // Wait for content to load, then trigger native print dialog only
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // Remove iframe after printing
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  };

  return (
    <>
      {/* Header with CSV Download */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{shipments.length} Shipment{shipments.length !== 1 ? 's' : ''}</h3>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {shipments.map((shipment) => {
          const isExpanded = expandedShipments.has(shipment.id);
          
          return (
            <div
              key={shipment.id}
              onClick={() => isExpanded && setSelectedShipment(shipment)}
              className={`bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow ${
                shipment.status === 'sent' ? 'border-orange-300 hover:border-orange-400' : 'border-gray-200'
              } ${isExpanded ? 'cursor-pointer' : ''}`}
            >
              <div className="p-4 sm:p-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-gray-50 flex-shrink-0">
                      <Package className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                    </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-mono font-semibold rounded">
                        {shipment.id}
                      </span>
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-gray-900 text-xs sm:text-sm truncate">From: {shipment.supplier}</span>
                      <span className="text-gray-400 flex-shrink-0">→</span>
                      <span className="font-semibold text-gray-900 text-xs sm:text-sm truncate">To: {shipment.receiver}</span>
                    </div>
                  </div>
                </div>
                <div className="self-start sm:self-auto flex items-center gap-2">
                  <span 
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(shipment.status)}`}
                    style={shipment.status === 'completed' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' } : {}}
                  >
                    {getStatusLabel(shipment)}
                  </span>
                  {shipment.status === 'completed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadPDF(shipment);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors"
                      title="Download PDF Report"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>
                  )}
                  <button
                    onClick={(e) => toggleExpand(shipment.id, e)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title={isExpanded ? "Collapse details" : "Expand details"}
                  >
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-600" /> : <ChevronDown className="w-5 h-5 text-gray-600" />}
                  </button>
                </div>
              </div>

              {/* Expandable Details */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                  {/* Date and Invoice */}
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-500">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{formatDate(shipment.date)}</span>
                    {shipment.purchaseInvoiceNumber && (
                      <>
                        <span className="text-gray-400">|</span>
                        <span className="font-semibold text-blue-600">Invoice: {shipment.purchaseInvoiceNumber}</span>
                      </>
                    )}
                  </div>

                  {/* Notes from Sender */}
                  {shipment.notes && (
                    <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-semibold text-blue-900 mb-1.5">Notes from Sender:</p>
                      <p className="text-sm text-blue-800">{shipment.notes}</p>
                    </div>
                  )}

                  {/* Shipment Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-gray-500" />
                    <p className="text-xs font-semibold text-gray-600">SENT BY SUPPLIER</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{formatKenyanNumber(shipment.sentKg, 2)} KG</p>
                  <p className="text-xs text-orange-500 font-bold mt-1">@ KSH {formatKenyanNumber(shipment.ratePerKg, 2)}/KG</p>
                </div>

                {shipment.receivedKg !== undefined && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Truck className="w-4 h-4 text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-600">RECEIVED</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{formatKenyanNumber(shipment.receivedKg, 2)} KG</p>
                    <p className="text-xs text-orange-500 font-bold mt-1">Transport loss: {formatKenyanNumber(shipment.transportLoss || 0, 2)} KG ({formatKenyanNumber(shipment.transportLossPercent || 0, 1)}%)</p>
                  </div>
                )}

                {shipment.processedKg !== undefined && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Factory className="w-4 h-4 text-blue-600" />
                      <p className="text-xs font-semibold text-blue-600">PROCESSED</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{formatKenyanNumber(shipment.processedKg, 2)} KG</p>
                    <p className="text-xs text-orange-500 font-bold mt-1">
                      Processing loss: {formatKenyanNumber((shipment.cumulativeLossKg || 0) - (shipment.transportLoss || 0), 2)} KG ({formatKenyanNumber((shipment.cumulativeLossPercent || 0) - (shipment.transportLossPercent || 0), 1)}%)
                    </p>
                  </div>
                )}
              </div>

              {/* Total Loss Summary - Only show if completed */}
              {shipment.status === 'completed' && shipment.cumulativeLossKg !== undefined && (() => {
                // Calculate cumulative processing loss (all stages)
                const processingLossKg = shipment.cumulativeLossKg - (shipment.transportLoss || 0);
                const processingLossMoney = (shipment.cumulativeLossMoney || 0) - (shipment.transportLossMoney || 0);
                const receivedKg = shipment.receivedKg || shipment.sentKg;
                const processingLossPercent = receivedKg > 0 ? (processingLossKg / receivedKg) * 100 : 0;

                return (
                  <div className="mt-4 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-red-900 mb-3">Complete Loss Summary</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-slate-600 mb-2">Transport Loss</p>
                        <p className="text-lg font-bold text-orange-600">{formatKenyanNumber(shipment.transportLoss || 0, 2)} KG</p>
                        <p className="text-sm font-semibold text-red-600 mt-1">KSH {formatKenyanNumber(shipment.transportLossMoney || 0, 2)}</p>
                        <p className="text-xs text-orange-500 mt-1">{formatKenyanNumber(shipment.transportLossPercent || 0, 1)}%</p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-slate-600 mb-2">Processing Loss (All Stages)</p>
                        <p className="text-lg font-bold text-orange-600">{formatKenyanNumber(processingLossKg, 2)} KG</p>
                        <p className="text-sm font-semibold text-red-600 mt-1">KSH {formatKenyanNumber(processingLossMoney, 2)}</p>
                        <p className="text-xs text-orange-500 mt-1">{formatKenyanNumber(processingLossPercent, 1)}%</p>
                      </div>
                      <div className="bg-red-100 rounded-lg p-3">
                        <p className="text-xs text-slate-600 mb-2">Total Loss</p>
                        <p className="text-xl font-bold text-red-600">{formatKenyanNumber(shipment.cumulativeLossKg, 2)} KG</p>
                        <p className="text-lg font-bold text-red-700 mt-1">KSH {formatKenyanNumber(shipment.cumulativeLossMoney || 0, 2)}</p>
                        <p className="text-xs text-red-600 mt-1">{formatKenyanNumber(shipment.cumulativeLossPercent || 0, 1)}%</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Call to Action */}
              {shipment.status === 'sent' && (
                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm text-orange-900 font-medium">Click to mark as received and add details</p>
                </div>
              )}

              {shipment.status === 'received' && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-medium">Click to add processing details</p>
                </div>
              )}
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Update Modal */}
      {selectedShipment && (
        <ReceiverUpdateModal
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
          onUpdate={async (updated) => {
            try {
              setUpdating(true);
              console.log('Updating shipment in Firestore:', updated);
              
              // Check if shipment status is changing to 'received' for the first time
              const isNewlyReceived = selectedShipment.status === 'sent' && updated.status === 'received';
              
              await updateShipment(updated.id, updated);
              console.log('Shipment updated successfully');
              
              // Create a transaction in Firestore when shipment is received
              if (isNewlyReceived) {
                console.log('Creating transaction for received shipment...');
                const transaction: Transaction = {
                  id: Date.now().toString(),
                  date: updated.date,
                  description: `Material purchase from ${updated.supplier}`,
                  type: 'debit',
                  amount: updated.totalCost,
                  category: 'Material Purchase',
                  paymentMethod: 'BANK',
                  shipmentId: updated.id,
                  purchaseInvoiceNumber: updated.purchaseInvoiceNumber,
                };
                
                try {
                  const transactionId = await addTransaction(transaction);
                  console.log('Transaction created with ID:', transactionId);
                } catch (txError) {
                  console.error('Error creating transaction:', txError);
                  // Don't fail the whole operation if transaction creation fails
                }
              }
              
              onUpdateShipment(updated);
              setSelectedShipment(null);
            } catch (error) {
              console.error('Error updating shipment:', error);
              alert('Failed to update shipment. Please try again.');
            } finally {
              setUpdating(false);
            }
          }}
          updating={updating}
        />
      )}
    </>
  );
}
