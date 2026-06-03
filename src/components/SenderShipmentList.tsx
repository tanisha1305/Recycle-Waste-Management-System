import { useState } from 'react';
import { Send, Package, Calendar, User, CheckCircle, Clock, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Shipment } from '../types';
import { formatKenyanNumber } from '../utils/numberFormat';

interface SenderShipmentListProps {
  shipments: Shipment[];
}

export default function SenderShipmentList({
  shipments,
}: SenderShipmentListProps) {
  const [expandedShipments, setExpandedShipments] = useState<Set<string>>(new Set());

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

  if (shipments.length === 0) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl p-12 sm:p-16 text-center border border-gray-200">
        <Package className="w-16 sm:w-20 h-16 sm:h-20 text-gray-300 mx-auto mb-3 sm:mb-4" />
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1.5 sm:mb-2">No Shipments Yet</h3>
        <p className="text-xs sm:text-sm text-gray-500 font-normal">Click "New Shipment" to record your first purchase and send</p>
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

  const getStatusBadge = (status: Shipment['status']) => {
    switch (status) {
      case 'sent':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            Sent - Awaiting Receipt
          </span>
        );
      case 'received':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Received
          </span>
        );
      case 'sorting':
      case 'crushing':
      case 'washing':
      case 'pelleting':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Completed
          </span>
        );
    }
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
            .notes-section {
              border: 1px solid #000;
              padding: 10px;
              margin: 10px 0;
              background-color: #fafafa;
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
              <td><strong>${shipment.supplierCode ? `${shipment.supplierCode} - ` : ''}${shipment.supplier}</strong></td>
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
                <td class="text-right"><strong>${formatKenyanNumber(shipment.purchaseKg, 2)}</strong></td>
                <td>@ KSH ${formatKenyanNumber(shipment.ratePerKg, 2)}/KG</td>
              </tr>
              <tr>
                <td><strong>Sent</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.sentKg, 2)}</strong></td>
                <td>Initial Cost: KSH ${formatKenyanNumber(shipment.totalCost, 2)}</td>
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
                <td class="text-right"><strong>${formatKenyanNumber(shipment.cumulativeLossKg || shipment.totalLoss || 0, 2)}</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.cumulativeLossMoney || shipment.totalLossMoney || 0, 2)}</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(shipment.cumulativeLossPercent || shipment.totalLossPercent || 0, 2)}%</strong></td>
              </tr>
            </tbody>
          </table>
          
          <div class="section-title">COST ANALYSIS</div>
          <div class="summary-boxes">
            <div class="summary-box">
              <div class="summary-label">INITIAL COST</div>
              <div class="summary-value">KSH ${formatKenyanNumber(shipment.totalCost, 2)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">LOSS COST</div>
              <div class="summary-value">KSH ${formatKenyanNumber(shipment.cumulativeLossMoney || shipment.totalLossMoney || 0, 2)}</div>
            </div>
            <div class="summary-box">
              <div class="summary-label">TOTAL COST</div>
              <div class="summary-value">KSH ${formatKenyanNumber(shipment.totalCost + (shipment.cumulativeLossMoney || shipment.totalLossMoney || 0), 2)}</div>
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
          <div class="notes-section">
            ${shipment.notes}
          </div>
          ` : ''}
          
          ${(shipment.deliveryNoteItemCode || shipment.deliveryNoteText) ? `
          <div class="section-title">DELIVERY NOTE</div>
          <div class="notes-section">
            ${shipment.deliveryNoteItemCode ? `<p><strong>Item Code:</strong> ${shipment.deliveryNoteItemCode}</p>` : ''}
            ${shipment.deliveryNoteText ? `<p style="margin-top: 5px;">${shipment.deliveryNoteText}</p>` : ''}
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
    <div className="space-y-3 sm:space-y-4">
      {shipments.map((shipment) => {
        const isExpanded = expandedShipments.has(shipment.id);
        
        return (
          <div key={shipment.id} className="bg-white rounded-xl sm:rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-4 sm:p-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-0">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="p-1.5 sm:p-2 bg-emerald-100 rounded-lg flex-shrink-0">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-mono font-semibold rounded">
                        {shipment.id}
                      </span>
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-gray-900 text-xs sm:text-sm truncate">
                        From: {shipment.supplierCode ? `${shipment.supplierCode} - ` : ''}{shipment.supplier}
                      </span>
                      <span className="text-gray-400 flex-shrink-0">→</span>
                      <span className="font-semibold text-gray-900 text-xs sm:text-sm truncate">
                        To: {shipment.receiver}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(shipment.status)}
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

                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <p className="text-xs font-semibold text-gray-600 mb-1.5 sm:mb-2">
                  PURCHASED
                </p>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-base sm:text-lg font-bold text-gray-900">
                    {formatKenyanNumber(shipment.purchaseKg, 2)} KG
                  </p>
                  <p className="text-xs text-orange-500 font-bold">
                    @ KSH {formatKenyanNumber(shipment.ratePerKg, 2)}/KG
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <p className="text-xs font-semibold text-blue-600 mb-1.5 sm:mb-2">SENT</p>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-base sm:text-lg font-bold text-gray-900">
                    {formatKenyanNumber(shipment.sentKg, 2)} KG
                  </p>
                  <p className="text-xs text-orange-500 font-bold">
                    Initial Cost: KSH {formatKenyanNumber(shipment.totalCost, 2)}
                  </p>
                </div>
              </div>

              {shipment.receivedKg !== undefined && (
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <p className="text-xs font-semibold text-purple-600 mb-1.5 sm:mb-2">
                    RECEIVED
                  </p>
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-base sm:text-lg font-bold text-gray-900">
                      {formatKenyanNumber(shipment.receivedKg, 2)} KG
                    </p>
                    <p className="text-xs text-orange-500 font-bold">
                      Loss: {formatKenyanNumber(shipment.transportLoss || 0, 2)} KG (
                      {formatKenyanNumber(shipment.transportLossPercent || 0, 1)}%)
                    </p>
                  </div>
                </div>
              )}

              {(shipment.processedKg !== undefined || shipment.status === 'completed') && (
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <p className="text-xs font-semibold text-emerald-600 mb-1.5 sm:mb-2">
                    PROCESSED
                  </p>
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-base sm:text-lg font-bold text-gray-900">
                      {formatKenyanNumber(shipment.processedKg || 
                        (shipment.processingStages?.stage4_pelleting?.outputKg) || 
                        0, 2)} KG
                    </p>
                    <p className="text-xs text-orange-500 font-bold">
                      Loss: {formatKenyanNumber((shipment.cumulativeLossKg || shipment.totalLoss || 0) - (shipment.transportLoss || 0), 2)} KG (
                      {formatKenyanNumber((shipment.cumulativeLossPercent || shipment.totalLossPercent || 0) - (shipment.transportLossPercent || 0), 1)}%)
                    </p>
                  </div>
                </div>
              )}

              {shipment.status === 'completed' && shipment.effectiveCostPerKg && (
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <p className="text-xs font-semibold text-amber-600 mb-1.5 sm:mb-2">
                    EFFECTIVE RATE
                  </p>
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-base sm:text-lg font-bold text-gray-900">
                      KSH {formatKenyanNumber(shipment.effectiveCostPerKg, 2)}/KG
                    </p>
                    <p className="text-xs text-orange-500 font-bold">
                      +{formatKenyanNumber(shipment.effectiveCostPerKg - shipment.ratePerKg, 2)}/KG increase
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Total Summary - Only show if completed */}
            {shipment.status === 'completed' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
                  <p className="text-xs sm:text-sm font-semibold text-red-900 mb-2 sm:mb-3">
                    Total Loss (Transport + Processing)
                  </p>
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm text-gray-600">Weight Loss</span>
                      <span className="text-lg sm:text-xl font-bold text-red-600">
                        {formatKenyanNumber(shipment.cumulativeLossKg || shipment.totalLoss || 0, 2)} KG
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm text-gray-600">Money Loss</span>
                      <span className="text-lg sm:text-xl font-bold text-red-600">
                        KSH {formatKenyanNumber(shipment.cumulativeLossMoney || shipment.totalLossMoney || 0, 2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-red-200">
                      <span className="text-xs sm:text-sm text-gray-600">Percentage</span>
                      <span className="text-base sm:text-lg font-semibold text-red-600">
                        {formatKenyanNumber(shipment.cumulativeLossPercent || shipment.totalLossPercent || 0, 1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4">
                  <p className="text-xs sm:text-sm font-semibold text-amber-900 mb-2 sm:mb-3">
                    Cost Analysis
                  </p>
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm text-gray-600">Initial Cost</span>
                      <span className="text-base sm:text-lg font-semibold text-gray-700">
                        KSH {formatKenyanNumber(shipment.totalCost, 2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm text-gray-600">Loss Cost</span>
                      <span className="text-base sm:text-lg font-semibold text-red-600">
                        KSH {formatKenyanNumber(shipment.cumulativeLossMoney || shipment.totalLossMoney || 0, 2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-amber-300">
                      <span className="text-xs sm:text-sm font-bold text-gray-700">Total Cost</span>
                      <span className="text-lg sm:text-xl font-bold text-amber-600">
                        KSH {formatKenyanNumber(shipment.totalCost + (shipment.cumulativeLossMoney || shipment.totalLossMoney || 0), 2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {shipment.notes && (
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-1">NOTES</p>
                <p className="text-xs sm:text-sm text-gray-700">{shipment.notes}</p>
              </div>
            )}

            {/* Delivery Note */}
            {(shipment.deliveryNoteItemCode || shipment.deliveryNoteText) && (
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-purple-200 bg-purple-50 rounded-lg p-3 sm:p-4">
                <p className="text-xs font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  DELIVERY NOTE
                </p>
                {shipment.deliveryNoteItemCode && (
                  <p className="text-xs text-purple-700 mb-2">
                    <span className="font-semibold">Item Code:</span> {shipment.deliveryNoteItemCode}
                  </p>
                )}
                {shipment.deliveryNoteText && (
                  <p className="text-xs sm:text-sm text-purple-800 leading-relaxed">{shipment.deliveryNoteText}</p>
                )}
              </div>
            )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
