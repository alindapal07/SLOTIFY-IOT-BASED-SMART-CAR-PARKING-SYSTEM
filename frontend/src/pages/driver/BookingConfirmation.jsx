import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../services/api';
import {
  Loader2, MapPin, Car, Clock, CalendarDays, CreditCard,
  AlertTriangle, Download, ArrowLeft, QrCode, Hash, Layers,
  Shield, CheckCircle2, ChevronRight, Wifi
} from 'lucide-react';

const STATUS_CONFIG = {
  Confirmed: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Confirmed' },
  Active:    { bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: 'Active · Parked' },
  ENTERING:  { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400 animate-pulse', label: 'Entering · Awaiting Sensor' },
  PARKED:    { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Parked ✓' },
  EXITING:   { bg: 'bg-blue-50 text-blue-600 border-blue-200', dot: 'bg-blue-400 animate-pulse', label: 'Exiting · Sensor Pending' },
  Completed: { bg: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400', label: 'Completed' },
  Cancelled: { bg: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500', label: 'Cancelled' },
  Expired:   { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Expired' },
};

const DetailRow = ({ icon: Icon, iconColor, label, primary, secondary }) => (
  <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}>
      <Icon className="w-4 h-4" />
    </div>
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{primary}</p>
      {secondary && <p className="text-xs text-gray-500 mt-0.5">{secondary}</p>}
    </div>
  </div>
);

const BookingConfirmation = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const { data } = await api.get(`/bookings/${bookingId}`);
        setBooking(data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load booking details.');
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3 bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-gray-500 text-sm font-medium">Loading your parking ticket...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 bg-gray-50">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <p className="text-gray-800 font-semibold">{error}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 font-medium hover:underline">
          ← Go back
        </button>
      </div>
    );
  }

  let qrPayload = '';
  if (booking.qrCodeData) {
    try { qrPayload = window.atob(booking.qrCodeData); }
    catch (e) { qrPayload = booking.qrCodeData; }
  }

  const zone = booking.zoneId;
  const slot = booking.slotId;
  const vehicle = booking.vehicleId;
  const bookingRef = booking._id?.toString().toUpperCase().slice(-8);
  const startDate = new Date(booking.startTime);
  const endDate = new Date(booking.endTime);
  const isActive = ['Confirmed', 'Active', 'ENTERING', 'PARKED', 'EXITING'].includes(booking.status);
  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.Confirmed;

  const fmt = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4 print:bg-white print:py-0">

      {/* Back navigation */}
      <div className="w-full max-w-md mb-5 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition text-sm font-medium group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>
      </div>

      {/* Ticket Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border print:rounded-none">

        {/* Ticket Header */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <QrCode className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-gray-900 text-sm">Smart Parking</span>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
          </div>

          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1">Parking Ticket</p>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              {zone?.name || 'Parking Reservation'}
            </h1>
            <p className="text-xs text-gray-400 font-mono mt-1">REF: SP-{bookingRef}</p>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col items-center px-6 py-8 bg-gray-50 border-b border-dashed border-gray-200">
          {isActive && qrPayload ? (
            <>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <QRCodeSVG
                  value={qrPayload}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <p className="mt-3 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                Scan this code at the parking gate
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 px-8">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                <Shield className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 text-center font-medium">
                {booking.status === 'Completed' ? 'Session complete — ticket expired' :
                 booking.status === 'Cancelled' ? 'This booking was cancelled' :
                 'QR code unavailable'}
              </p>
            </div>
          )}
        </div>

        {/* Booking Details */}
        <div className="px-6 pt-4 pb-2">
          <DetailRow
            icon={MapPin} iconColor="bg-blue-50 text-blue-600"
            label="Location"
            primary={zone?.name || '—'}
            secondary={zone?.address}
          />
          <div className="grid grid-cols-2 gap-x-4">
            <div className="flex items-start gap-3 py-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Slot</p>
                <p className="text-sm font-bold text-gray-900 font-mono mt-0.5">{slot?.slotIdentifier || '—'}</p>
                {slot?.isEV && <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">⚡ EV Charger</p>}
              </div>
            </div>
            <div className="flex items-start gap-3 py-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 mt-0.5">
                <Car className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Vehicle</p>
                <p className="text-sm font-bold text-gray-900 font-mono mt-0.5">{booking.vehiclePlate || vehicle?.licensePlate || '—'}</p>
                {vehicle && <p className="text-[11px] text-gray-500">{vehicle.make} {vehicle.model}</p>}
              </div>
            </div>
            <div className="flex items-start gap-3 py-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0 mt-0.5">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Entry</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{fmt(startDate)}</p>
                <p className="text-xs text-gray-500">{fmtTime(startDate)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 py-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Exit By</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{fmt(endDate)}</p>
                <p className="text-xs text-gray-500">{fmtTime(endDate)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="mx-6 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
            <Hash className="w-3.5 h-3.5" />
            {booking.hours || 1} hour{booking.hours !== 1 ? 's' : ''} booked
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gray-400" />
            <span className="text-lg font-black text-gray-900">₹{booking.totalCost?.toFixed(2)}</span>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">PAID</span>
          </div>
        </div>

        {/* Security Note */}
        <div className="mx-6 mb-5 flex items-center gap-2 text-[10px] text-gray-400">
          <Shield className="w-3 h-3 shrink-0" />
          AES-256 encrypted · Version-locked · Single-use per gate action
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2.5 print:hidden border-t border-gray-100 pt-4">
          <button
            onClick={() => window.print()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm py-2.5 rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            Download / Print Ticket
          </button>
          <button
            onClick={() => navigate('/driver')}
            className="w-full text-sm text-gray-500 hover:text-gray-800 font-medium py-1.5 transition"
          >
            Back to Dashboard
          </button>
        </div>

      </div>

      {/* Bottom spacing */}
      <div className="h-8 print:hidden" />
    </div>
  );
};

export default BookingConfirmation;
