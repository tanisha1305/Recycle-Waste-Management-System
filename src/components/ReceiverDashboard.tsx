import { TrendingDown, Package, AlertCircle, Activity } from 'lucide-react';
import { Shipment } from '../types';
import { formatKenyanNumber } from '../utils/numberFormat';

interface ReceiverDashboardProps {
  shipments: Shipment[];
}

export default function ReceiverDashboard({ shipments }: ReceiverDashboardProps) {
  // Calculate statistics
  const pendingShipments = shipments.filter(s => s.status === 'sent').length;
  const receivedShipments = shipments.filter(s => s.status === 'received' || s.status === 'sorting' || s.status === 'crushing' || s.status === 'washing' || s.status === 'pelleting' || s.status === 'completed').length;
  const processingShipments = shipments.filter(s => s.status === 'sorting' || s.status === 'crushing' || s.status === 'washing' || s.status === 'pelleting').length;
  const completedShipments = shipments.filter(s => s.status === 'completed').length;

  // Calculate total losses
  const totalTransportLoss = shipments.reduce((sum, s) => sum + (s.transportLoss || 0), 0);
  const totalTransportLossMoney = shipments.reduce((sum, s) => sum + (s.transportLossMoney || 0), 0);
  const totalCumulativeLoss = shipments.reduce((sum, s) => sum + (s.cumulativeLossKg || 0), 0);
  const totalCumulativeLossMoney = shipments.reduce((sum, s) => sum + (s.cumulativeLossMoney || 0), 0);

  // Calculate processing efficiency
  const totalReceived = shipments.reduce((sum, s) => sum + (s.receivedKg || 0), 0);
  const totalProcessed = shipments.reduce((sum, s) => sum + (s.processedKg || 0), 0);
  const processingEfficiency = totalReceived > 0 ? ((totalProcessed / totalReceived) * 100) : 0;

  // Get recent shipments for loss trend
  const recentShipments = [...shipments]
    .filter(s => s.receivedKg !== undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  // Calculate average loss percentage
  const avgTransportLoss = shipments.filter(s => s.transportLossPercent).length > 0
    ? shipments.reduce((sum, s) => sum + (s.transportLossPercent || 0), 0) / shipments.filter(s => s.transportLossPercent).length
    : 0;

  const avgCumulativeLoss = shipments.filter(s => s.cumulativeLossPercent).length > 0
    ? shipments.reduce((sum, s) => sum + (s.cumulativeLossPercent || 0), 0) / shipments.filter(s => s.cumulativeLossPercent).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="p-3 bg-blue-50 rounded-xl">
            <Activity className="w-8 h-8 text-blue-600" />
          </div>
          Dashboard Overview
        </h1>
        <p className="text-gray-600 mt-2">
          Monitor your operations, track losses, and analyze efficiency
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Shipments */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-orange-50 rounded-lg">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">Pending Receipt</p>
          <p className="text-3xl font-bold text-gray-900">{pendingShipments}</p>
          <p className="text-xs text-gray-500 mt-2">Awaiting processing</p>
        </div>

        {/* Received Shipments */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-emerald-50 rounded-lg">
              <Package className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">Total Received</p>
          <p className="text-3xl font-bold text-gray-900">{receivedShipments}</p>
          <p className="text-xs text-gray-500 mt-2">All time</p>
        </div>

        {/* In Processing */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-blue-50 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">In Processing</p>
          <p className="text-3xl font-bold text-gray-900">{processingShipments}</p>
          <p className="text-xs text-gray-500 mt-2">Active stages</p>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-purple-50 rounded-lg">
              <TrendingDown className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">Completed</p>
          <p className="text-3xl font-bold text-gray-900">{completedShipments}</p>
          <p className="text-xs text-gray-500 mt-2">Fully processed</p>
        </div>
      </div>

      {/* Loss Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transport Loss Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-50 rounded-lg">
              <TrendingDown className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Transport Loss</h3>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Total Loss (Weight)</p>
              <p className="text-2xl font-bold text-orange-600">{formatKenyanNumber(totalTransportLoss)} KG</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Total Loss (Value)</p>
              <p className="text-2xl font-bold text-red-600">KSH {formatKenyanNumber(totalTransportLossMoney)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Average Loss Rate</p>
              <p className="text-xl font-bold text-orange-500">{formatKenyanNumber(avgTransportLoss, 2)}%</p>
            </div>
          </div>
        </div>

        {/* Cumulative Loss Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Total Loss (Transport + Processing)</h3>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Total Loss (Weight)</p>
              <p className="text-2xl font-bold text-red-600">{formatKenyanNumber(totalCumulativeLoss)} KG</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Total Loss (Value)</p>
              <p className="text-2xl font-bold text-red-700">KSH {formatKenyanNumber(totalCumulativeLossMoney)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Average Loss Rate</p>
              <p className="text-xl font-bold text-red-500">{formatKenyanNumber(avgCumulativeLoss, 2)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Processing Efficiency */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <Activity className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Processing Efficiency</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-2">Total Received</p>
            <p className="text-2xl font-bold text-gray-900">{formatKenyanNumber(totalReceived)} KG</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">Total Processed</p>
            <p className="text-2xl font-bold text-emerald-600">{formatKenyanNumber(totalProcessed)} KG</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">Efficiency Rate</p>
            <p className="text-2xl font-bold text-blue-600">{formatKenyanNumber(processingEfficiency, 1)}%</p>
          </div>
        </div>
      </div>

      {/* Loss Comparison Graph - Donut Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-50 rounded-lg">
            <TrendingDown className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Loss Breakdown Chart</h3>
        </div>
        
        {recentShipments.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Donut Chart Visualization */}
            <div className="flex items-center justify-center">
              <div className="relative w-64 h-64">
                {/* Calculate percentages */}
                {(() => {
                  const processingLoss = totalCumulativeLoss - totalTransportLoss;
                  const total = totalCumulativeLoss;
                  const transportPercent = total > 0 ? (totalTransportLoss / total) * 100 : 50;
                  const processingPercent = total > 0 ? (processingLoss / total) * 100 : 50;
                  
                  // SVG Donut Chart
                  const radius = 90;
                  const circumference = 2 * Math.PI * radius;
                  const transportDash = (transportPercent / 100) * circumference;
                  const processingDash = (processingPercent / 100) * circumference;
                  
                  return (
                    <>
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                        {/* Background Circle */}
                        <circle
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="none"
                          stroke="#f3f4f6"
                          strokeWidth="20"
                        />
                        
                        {/* Transport Loss Arc */}
                        <circle
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth="20"
                          strokeDasharray={`${transportDash} ${circumference - transportDash}`}
                          strokeLinecap="round"
                          className="transition-all duration-500"
                        />
                        
                        {/* Processing Loss Arc */}
                        <circle
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="none"
                          stroke="#8b5cf6"
                          strokeWidth="20"
                          strokeDasharray={`${processingDash} ${circumference - processingDash}`}
                          strokeDashoffset={-transportDash}
                          strokeLinecap="round"
                          className="transition-all duration-500"
                        />
                      </svg>
                      
                      {/* Center Text */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-3xl font-bold text-gray-900">{formatKenyanNumber(totalCumulativeLoss, 1)}</p>
                        <p className="text-sm text-gray-500 mt-1">KG Total Loss</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Loss Statistics */}
            <div className="flex flex-col justify-center space-y-6">
              {/* Transport Loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-cyan-500 rounded"></div>
                    <span className="text-sm font-semibold text-gray-700">Transport Loss</span>
                  </div>
                  <span className="text-sm text-gray-500">{formatKenyanNumber(avgTransportLoss, 2)}% avg</span>
                </div>
                <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-100">
                  <p className="text-2xl font-bold text-cyan-700">{formatKenyanNumber(totalTransportLoss)} KG</p>
                  <p className="text-xs text-cyan-600 mt-1">
                    {totalCumulativeLoss > 0 
                      ? `${formatKenyanNumber((totalTransportLoss / totalCumulativeLoss) * 100, 1)}% of total loss`
                      : '0% of total loss'}
                  </p>
                </div>
              </div>

              {/* Processing Loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-violet-500 rounded"></div>
                    <span className="text-sm font-semibold text-gray-700">Processing Loss</span>
                  </div>
                  <span className="text-sm text-gray-500">{formatKenyanNumber(avgCumulativeLoss - avgTransportLoss, 2)}% avg</span>
                </div>
                <div className="bg-violet-50 rounded-lg p-4 border border-violet-100">
                  <p className="text-2xl font-bold text-violet-700">{formatKenyanNumber(totalCumulativeLoss - totalTransportLoss)} KG</p>
                  <p className="text-xs text-violet-600 mt-1">
                    {totalCumulativeLoss > 0 
                      ? `${formatKenyanNumber(((totalCumulativeLoss - totalTransportLoss) / totalCumulativeLoss) * 100, 1)}% of total loss`
                      : '0% of total loss'}
                  </p>
                </div>
              </div>

              {/* Efficiency Indicator */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total Material Received</span>
                  <span className="font-semibold text-gray-900">{formatKenyanNumber(totalReceived)} KG</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-600">Loss Rate</span>
                  <span 
                    className={`font-semibold ${
                      avgCumulativeLoss < 5 ? '' : 
                      avgCumulativeLoss < 10 ? 'text-yellow-600' : 'text-red-600'
                    }`}
                    style={avgCumulativeLoss < 5 ? { color: '#10b981' } : {}}
                  >
                    {formatKenyanNumber(avgCumulativeLoss, 2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <TrendingDown className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No loss data available yet</p>
            <p className="text-sm text-gray-400 mt-2">Process shipments to see loss analytics</p>
          </div>
        )}
      </div>

      {/* Recent Shipments Loss Trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Package className="w-5 h-5 text-purple-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Shipment-wise Loss Analysis</h3>
        </div>
        
        {recentShipments.length > 0 ? (
          <div className="space-y-4">
            {recentShipments.map((shipment) => {
              const transportLoss = shipment.transportLoss || 0;
              const totalLoss = shipment.cumulativeLossKg || 0;
              const processingLoss = totalLoss - transportLoss;
              const totalLossPercent = shipment.cumulativeLossPercent || 0;
              
              // Calculate percentages for stacked bar
              const maxLossKg = Math.max(...recentShipments.map(s => s.cumulativeLossKg || 0));
              const transportWidth = maxLossKg > 0 ? (transportLoss / maxLossKg) * 100 : 0;
              const processingWidth = maxLossKg > 0 ? (processingLoss / maxLossKg) * 100 : 0;

              return (
                <div key={shipment.id} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <Package className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <span className="font-semibold text-gray-800 block">
                          {shipment.supplier}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(shipment.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{formatKenyanNumber(totalLoss)} KG</p>
                      <p className="text-xs text-gray-600">{formatKenyanNumber(totalLossPercent, 2)}% loss</p>
                    </div>
                  </div>
                  
                  {/* Stacked Bar Chart */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 h-8 rounded-lg overflow-hidden bg-gray-200">
                      {/* Transport Loss */}
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 flex items-center justify-center transition-all duration-300"
                        style={{ width: `${transportWidth}%` }}
                        title={`Transport: ${formatKenyanNumber(transportLoss)} KG`}
                      >
                        {transportWidth > 15 && (
                          <span className="text-xs font-semibold text-white px-2">
                            {formatKenyanNumber(transportLoss)} KG
                          </span>
                        )}
                      </div>
                      
                      {/* Processing Loss */}
                      <div
                        className="h-full bg-gradient-to-r from-violet-400 to-violet-500 flex items-center justify-center transition-all duration-300"
                        style={{ width: `${processingWidth}%` }}
                        title={`Processing: ${formatKenyanNumber(processingLoss)} KG`}
                      >
                        {processingWidth > 15 && (
                          <span className="text-xs font-semibold text-white px-2">
                            {formatKenyanNumber(processingLoss)} KG
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Legend */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded bg-cyan-500"></div>
                          <span className="text-gray-600">Transport: {formatKenyanNumber(transportLoss)} KG</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded bg-violet-500"></div>
                          <span className="text-gray-600">Processing: {formatKenyanNumber(processingLoss)} KG</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No shipment data available yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
