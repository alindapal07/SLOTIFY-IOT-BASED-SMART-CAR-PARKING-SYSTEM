/**
 * Realistic Kolkata Parking Marketplace Development Seed System
 * 
 * Generates TEST/DEMO parking marketplace facilities across Kolkata.
 * 
 * DISCLAIMER:
 * This data is generated for DEVELOPMENT, TESTING, and DEMONSTRATION purposes only.
 * It does not reflect official real-world municipal or commercial parking availability.
 * 
 * Safety Features:
 * - Environment-aware: blocks automated runs against production without explicit flag.
 * - Idempotent & Repeatable: replaces prior [DEMO-KOLKATA-SEED] facilities cleanly without
 *   destroying real users, admins, drivers, wallets, or active real bookings.
 * 
 * Usage:
 *   npm run seed:parking
 *   node src/scripts/seedParking.js
 */

const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Load environment configuration
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require('../config/database');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const ParkingZone = require('../models/ParkingZone');
const ParkingSlot = require('../models/ParkingSlot');
const IoTConfiguration = require('../models/IoTConfiguration');

// ═══════════════════════════════════════════════════════════════
// 1. SAFETY & ENVIRONMENT CHECK
// ═══════════════════════════════════════════════════════════════
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
  console.error('\n❌ ERROR: Cannot run demo seed script in production!');
  console.error('If you genuinely intend to seed demo data into production, set ALLOW_PROD_SEED=true.\n');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// 2. DEMO PROVIDERS (Kolkata Region)
// ═══════════════════════════════════════════════════════════════
const DEMO_PROVIDERS = [
  {
    fullName: 'Rajesh Gupta (Gupta AutoPark)',
    email: 'provider@smartparking.in',
    phone: '+91 98301 23456',
    businessName: 'Gupta AutoPark Plaza',
    businessType: 'Partnership',
    city: 'Kolkata',
    initialWalletBalance: 50000
  },
  {
    fullName: 'Kolkata Metropolitan AutoParks Ltd',
    email: 'kmda.parking@kolkatapark.in',
    phone: '+91 98310 98765',
    businessName: 'KMDA Urban Mobility Solutions',
    businessType: 'Private Limited',
    city: 'Kolkata',
    initialWalletBalance: 120000
  },
  {
    fullName: 'Bengal Urban Parking Solutions',
    email: 'bengal.urban@kolkatapark.in',
    phone: '+91 98305 54321',
    businessName: 'Bengal Smart Infrastructure',
    businessType: 'Proprietorship',
    city: 'Kolkata',
    initialWalletBalance: 75000
  },
  {
    fullName: 'Metro Core Valet & Transit Garages',
    email: 'metrocore@kolkatapark.in',
    phone: '+91 98308 11223',
    businessName: 'Metro Core Properties Ltd',
    businessType: 'Private Limited',
    city: 'Kolkata',
    initialWalletBalance: 90000
  }
];

// ═══════════════════════════════════════════════════════════════
// 3. REALISTIC KOLKATA PARKING FACILITIES (All 30 Requested Areas)
// Coordinates: [longitude, latitude] in GeoJSON format
// ═══════════════════════════════════════════════════════════════
const KOLKATA_FACILITIES = [
  // 1. Salt Lake
  {
    area: 'Salt Lake',
    name: 'City Centre 1 Multi-Level AutoPark',
    address: 'Block DC, Sector 1, Bidhannagar, Salt Lake, Kolkata',
    landmark: 'Opposite City Centre 1 Gate 2',
    pinCode: '700064',
    lng: 88.4068,
    lat: 22.5898,
    parkingType: 'Mall',
    propertyType: 'Commercial',
    basePricePerHour: 50,
    dailyRate: 350,
    slotsCount: 30,
    operatingHours: '08:00 - 23:30',
    amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Guard', 'Washroom', 'Wheelchair Access', 'Lighting'],
    rating: 4.6,
    totalRatings: 184
  },
  {
    area: 'Salt Lake',
    name: 'Karunamoyee Central Bus & Metro Parking',
    address: 'Karunamoyee Bus Terminal, Central Park Road, Salt Lake',
    landmark: 'Adjacent to Karunamoyee Metro Station Gate 1',
    pinCode: '700091',
    lng: 88.4230,
    lat: 22.5872,
    parkingType: 'Metro',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 200,
    slotsCount: 32,
    operatingHours: '05:30 - 23:45',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7'],
    rating: 4.2,
    totalRatings: 96
  },

  // 2. Sector V
  {
    area: 'Sector V',
    name: 'Webel More IT Tech Garage',
    address: 'Webel Bhavan Crossing, GP Block, Sector V, Bidhannagar',
    landmark: 'Near Webel Bhavan & RDB Boulevard',
    pinCode: '700091',
    lng: 88.4312,
    lat: 22.5739,
    parkingType: 'Office',
    propertyType: 'Commercial',
    basePricePerHour: 60,
    dailyRate: 400,
    slotsCount: 36,
    operatingHours: '24/7',
    amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Guard', '24x7', 'Lighting', 'Washroom'],
    rating: 4.7,
    totalRatings: 215
  },
  {
    area: 'Sector V',
    name: 'College More IT Hub Executive Parking',
    address: 'EP & GP Block, Ring Road, Sector V, Kolkata',
    landmark: 'Near SDF Building & Techno India',
    pinCode: '700091',
    lng: 88.4348,
    lat: 22.5698,
    parkingType: 'Market',
    propertyType: 'Office',
    basePricePerHour: 50,
    dailyRate: 350,
    slotsCount: 28,
    operatingHours: '07:00 - 23:00',
    amenities: ['CCTV', 'Security Guard', 'Lighting', 'Covered'],
    rating: 4.4,
    totalRatings: 130
  },

  // 3. New Town
  {
    area: 'New Town',
    name: 'Axis Mall Smart Underground Bay',
    address: 'Street No 106, Action Area 1C, New Town, Kolkata',
    landmark: 'Axis Mall Basement Level -1',
    pinCode: '700156',
    lng: 88.4625,
    lat: 22.5855,
    parkingType: 'Mall',
    propertyType: 'Commercial',
    basePricePerHour: 50,
    dailyRate: 350,
    slotsCount: 34,
    operatingHours: '09:00 - 23:00',
    amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Guard', 'Washroom', 'Wheelchair Access'],
    rating: 4.5,
    totalRatings: 178
  },
  {
    area: 'New Town',
    name: 'Eco Park Gate 4 Visitor Lot',
    address: 'Major Arterial Road, Action Area II, New Town',
    landmark: 'Eco Park Gate 4 Parking Enclosure',
    pinCode: '700156',
    lng: 88.4720,
    lat: 22.6025,
    parkingType: 'Public',
    propertyType: 'Public',
    basePricePerHour: 40,
    dailyRate: 250,
    slotsCount: 40,
    operatingHours: '06:00 - 21:00',
    amenities: ['CCTV', 'Lighting', 'Security Guard', 'Washroom', 'Wheelchair Access'],
    rating: 4.6,
    totalRatings: 242
  },

  // 4. Rajarhat
  {
    area: 'Rajarhat',
    name: 'Chinar Park Commercial Transit Lot',
    address: 'Chinar Park Crossing, Rajarhat Main Road, Kolkata',
    landmark: 'Near City Centre 2 Crossing',
    pinCode: '700135',
    lng: 88.4418,
    lat: 22.6210,
    parkingType: 'Market',
    propertyType: 'Commercial',
    basePricePerHour: 40,
    dailyRate: 280,
    slotsCount: 26,
    operatingHours: '24/7',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7'],
    rating: 4.1,
    totalRatings: 78
  },

  // 5. Park Street
  {
    area: 'Park Street',
    name: 'Park Street Heritage Underground Bay',
    address: 'Mother Teresa Sarani, Park Street Crossing, Kolkata',
    landmark: 'Near Park Plaza & Flurys',
    pinCode: '700016',
    lng: 88.3526,
    lat: 22.5510,
    parkingType: 'Market',
    propertyType: 'Commercial',
    basePricePerHour: 80,
    dailyRate: 550,
    slotsCount: 30,
    operatingHours: '24/7',
    amenities: ['CCTV', 'Covered', 'Security Guard', '24x7', 'Lighting', 'Washroom'],
    rating: 4.8,
    totalRatings: 310
  },

  // 6. Esplanade
  {
    area: 'Esplanade',
    name: 'Esplanade Metro & Curzon Park Lot',
    address: 'Jawaharlal Nehru Road, Esplanade, Kolkata',
    landmark: 'Adjacent to Esplanade Metro Complex',
    pinCode: '700069',
    lng: 88.3524,
    lat: 22.5647,
    parkingType: 'Metro',
    propertyType: 'Public',
    basePricePerHour: 50,
    dailyRate: 350,
    slotsCount: 32,
    operatingHours: '05:30 - 23:45',
    amenities: ['CCTV', 'Security Guard', 'Lighting', '24x7'],
    rating: 4.3,
    totalRatings: 189
  },

  // 7. BBD Bagh
  {
    area: 'BBD Bagh',
    name: 'Dalhousie Square Heritage Government Lot',
    address: 'BBD Bagh North, Hemanta Basu Sarani, Kolkata',
    landmark: 'Near GPO & Writers Building',
    pinCode: '700001',
    lng: 88.3476,
    lat: 22.5726,
    parkingType: 'Office',
    propertyType: 'Public',
    basePricePerHour: 70,
    dailyRate: 500,
    slotsCount: 28,
    operatingHours: '07:30 - 21:00',
    amenities: ['CCTV', 'Covered', 'Security Guard', 'Lighting'],
    rating: 4.2,
    totalRatings: 114
  },

  // 8. Sealdah
  {
    area: 'Sealdah',
    name: 'Sealdah Railway Terminal Multi-Tier Lot',
    address: 'Bipin Behari Ganguly Street, Sealdah, Kolkata',
    landmark: 'Sealdah South Station Entrance',
    pinCode: '700014',
    lng: 88.3712,
    lat: 22.5675,
    parkingType: 'Railway',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 200,
    slotsCount: 35,
    operatingHours: '24/7',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7', 'Washroom'],
    rating: 4.0,
    totalRatings: 230
  },

  // 9. Shyambazar
  {
    area: 'Shyambazar',
    name: 'Shyambazar Five-Point Junction Bay',
    address: 'Bhupen Bose Avenue, Shyambazar, Kolkata',
    landmark: 'Near Netaji Subhas Statue Five-Point Crossing',
    pinCode: '700004',
    lng: 88.3710,
    lat: 22.6022,
    parkingType: 'Public',
    propertyType: 'Public',
    basePricePerHour: 40,
    dailyRate: 280,
    slotsCount: 24,
    operatingHours: '06:00 - 23:00',
    amenities: ['CCTV', 'Lighting', 'Security Guard'],
    rating: 4.1,
    totalRatings: 87
  },

  // 10. Dum Dum
  {
    area: 'Dum Dum',
    name: 'Dum Dum Metro Terminal Parking',
    address: 'Dum Dum Road, Near Dum Dum Railway Station, Kolkata',
    landmark: 'Dum Dum Metro Station Gate 2',
    pinCode: '700028',
    lng: 88.3949,
    lat: 22.6225,
    parkingType: 'Metro',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 200,
    slotsCount: 30,
    operatingHours: '05:30 - 23:45',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7'],
    rating: 4.3,
    totalRatings: 145
  },

  // 11. Lake Town
  {
    area: 'Lake Town',
    name: 'Lake Town Clock Tower Shoppers Lot',
    address: 'Lake Town Link Road, Block A, Kolkata',
    landmark: 'Opposite Big Ben Clock Tower',
    pinCode: '700089',
    lng: 88.4011,
    lat: 22.6015,
    parkingType: 'Market',
    propertyType: 'Commercial',
    basePricePerHour: 40,
    dailyRate: 280,
    slotsCount: 22,
    operatingHours: '08:00 - 22:30',
    amenities: ['CCTV', 'Covered', 'Lighting', 'Security Guard'],
    rating: 4.4,
    totalRatings: 102
  },

  // 12. Kestopur
  {
    area: 'Kestopur',
    name: 'Kestopur VIP Road Junction Lot',
    address: 'VIP Road, Prafulla Kanan, Kestopur, Kolkata',
    landmark: 'Near Kestopur Footbridge',
    pinCode: '700102',
    lng: 88.4239,
    lat: 22.5932,
    parkingType: 'Street',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 220,
    slotsCount: 20,
    operatingHours: '06:00 - 23:00',
    amenities: ['CCTV', 'Lighting', 'Security Guard'],
    rating: 3.9,
    totalRatings: 64
  },

  // 13. Ultadanga
  {
    area: 'Ultadanga',
    name: 'Hudco More Transit Parking Plaza',
    address: 'Ultadanga Main Road, Near Bidhan Nagar Road Station, Kolkata',
    landmark: 'Hudco Crossing under Flyover',
    pinCode: '700067',
    lng: 88.3846,
    lat: 22.5898,
    parkingType: 'Public',
    propertyType: 'Public',
    basePricePerHour: 35,
    dailyRate: 250,
    slotsCount: 28,
    operatingHours: '24/7',
    amenities: ['CCTV', 'Covered', 'Lighting', 'Security Guard', '24x7'],
    rating: 4.1,
    totalRatings: 92
  },

  // 14. Ballygunge
  {
    area: 'Ballygunge',
    name: 'Ballygunge Circular Road Executive Garage',
    address: 'Ballygunge Circular Road, Near Military Camp, Kolkata',
    landmark: 'Near Quest Mall & Ballygunge Phari',
    pinCode: '700019',
    lng: 88.3655,
    lat: 22.5280,
    parkingType: 'Market',
    propertyType: 'Commercial',
    basePricePerHour: 60,
    dailyRate: 420,
    slotsCount: 26,
    operatingHours: '24/7',
    amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Guard', '24x7', 'Lighting'],
    rating: 4.7,
    totalRatings: 165
  },

  // 15. Gariahat
  {
    area: 'Gariahat',
    name: 'Gariahat Flyover Covered Shoppers Bay',
    address: 'Rashbehari Avenue, Gariahat Crossing, Kolkata',
    landmark: 'Beneath Gariahat Flyover, near Anandamela',
    pinCode: '700029',
    lng: 88.3643,
    lat: 22.5186,
    parkingType: 'Market',
    propertyType: 'Public',
    basePricePerHour: 50,
    dailyRate: 350,
    slotsCount: 30,
    operatingHours: '09:00 - 22:30',
    amenities: ['CCTV', 'Covered', 'Security Guard', 'Lighting'],
    rating: 4.3,
    totalRatings: 210
  },

  // 16. Kasba
  {
    area: 'Kasba',
    name: 'Acropolis Mall Secured Multi-Tier Parking',
    address: '1858 Rajdanga Main Road, Kasba, Kolkata',
    landmark: 'Acropolis Mall Basement Entry',
    pinCode: '700042',
    lng: 88.3831,
    lat: 22.5164,
    parkingType: 'Mall',
    propertyType: 'Commercial',
    basePricePerHour: 60,
    dailyRate: 400,
    slotsCount: 32,
    operatingHours: '09:30 - 23:30',
    amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Guard', 'Washroom', 'Wheelchair Access'],
    rating: 4.7,
    totalRatings: 280
  },

  // 17. Tollygunge
  {
    area: 'Tollygunge',
    name: 'Mahanayak Uttam Kumar Metro Terminal Bay',
    address: 'Deshapran Sasmal Road, Tollygunge, Kolkata',
    landmark: 'Opposite Tollygunge Tram Depot',
    pinCode: '700033',
    lng: 88.3468,
    lat: 22.4930,
    parkingType: 'Metro',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 200,
    slotsCount: 25,
    operatingHours: '05:30 - 23:45',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7'],
    rating: 4.2,
    totalRatings: 134
  },

  // 18. Jadavpur
  {
    area: 'Jadavpur',
    name: 'Jadavpur 8B Bus Stand Commuter Park',
    address: 'Raja SC Mullick Road, Jadavpur, Kolkata',
    landmark: 'Opposite Jadavpur University Main Gate',
    pinCode: '700032',
    lng: 88.3709,
    lat: 22.4955,
    parkingType: 'Public',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 200,
    slotsCount: 24,
    operatingHours: '06:00 - 23:00',
    amenities: ['CCTV', 'Lighting', 'Security Guard'],
    rating: 4.1,
    totalRatings: 88
  },

  // 19. Garia
  {
    area: 'Garia',
    name: 'Kavi Subhash Metro Inter-State Terminal Lot',
    address: 'New Garia Station Road, Garia, Kolkata',
    landmark: 'Adjacent to Kavi Subhash Metro Terminal',
    pinCode: '700084',
    lng: 88.3855,
    lat: 22.4707,
    parkingType: 'Metro',
    propertyType: 'Public',
    basePricePerHour: 25,
    dailyRate: 180,
    slotsCount: 30,
    operatingHours: '05:30 - 23:45',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7', 'Washroom'],
    rating: 4.3,
    totalRatings: 156
  },

  // 20. Behala
  {
    area: 'Behala',
    name: 'Behala Chowrasta Diamond Harbour Lot',
    address: 'Diamond Harbour Road, Behala Chowrasta, Kolkata',
    landmark: 'Near Behala Tram Depot Crossing',
    pinCode: '700034',
    lng: 88.3180,
    lat: 22.4990,
    parkingType: 'Market',
    propertyType: 'Public',
    basePricePerHour: 40,
    dailyRate: 280,
    slotsCount: 22,
    operatingHours: '07:00 - 22:30',
    amenities: ['CCTV', 'Lighting', 'Security Guard'],
    rating: 4.0,
    totalRatings: 79
  },

  // 21. Alipore
  {
    area: 'Alipore',
    name: 'Alipore Zoological & National Library Bay',
    address: 'Belvedere Road, Alipore, Kolkata',
    landmark: 'Opposite Alipore Zoo Gate 1',
    pinCode: '700027',
    lng: 88.3298,
    lat: 22.5323,
    parkingType: 'Public',
    propertyType: 'Public',
    basePricePerHour: 40,
    dailyRate: 280,
    slotsCount: 28,
    operatingHours: '08:00 - 20:00',
    amenities: ['CCTV', 'Lighting', 'Security Guard', 'Wheelchair Access'],
    rating: 4.5,
    totalRatings: 198
  },

  // 22. Kalighat
  {
    area: 'Kalighat',
    name: 'Kalighat Temple Pilgrimage Transit Bay',
    address: 'Kalitemple Road, Kalighat, Kolkata',
    landmark: 'Near Kalighat Kali Temple Gate 3',
    pinCode: '700026',
    lng: 88.3435,
    lat: 22.5197,
    parkingType: 'Public',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 220,
    slotsCount: 20,
    operatingHours: '05:00 - 22:30',
    amenities: ['CCTV', 'Lighting', 'Security Guard'],
    rating: 3.9,
    totalRatings: 142
  },

  // 23. Bhowanipore
  {
    area: 'Bhowanipore',
    name: 'Forum Mall Underground Parking Bay',
    address: '10/3 Elgin Road, Bhowanipore, Kolkata',
    landmark: 'Forum Mall Basement Entry',
    pinCode: '700025',
    lng: 88.3486,
    lat: 22.5312,
    parkingType: 'Mall',
    propertyType: 'Commercial',
    basePricePerHour: 60,
    dailyRate: 420,
    slotsCount: 26,
    operatingHours: '10:00 - 23:00',
    amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Guard', 'Washroom', 'Wheelchair Access'],
    rating: 4.6,
    totalRatings: 215
  },

  // 24. EM Bypass
  {
    area: 'EM Bypass',
    name: 'Mani Square Mall & Hotel Garage',
    address: '164/1 Maniktala Main Road, EM Bypass, Kolkata',
    landmark: 'Mani Square Complex',
    pinCode: '700054',
    lng: 88.4010,
    lat: 22.5680,
    parkingType: 'Mall',
    propertyType: 'Commercial',
    basePricePerHour: 60,
    dailyRate: 400,
    slotsCount: 32,
    operatingHours: '09:00 - 23:30',
    amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Guard', 'Washroom', 'Wheelchair Access'],
    rating: 4.7,
    totalRatings: 260
  },

  // 25. Science City
  {
    area: 'Science City',
    name: 'Science City & Milan Mela Exhibition Grounds',
    address: 'JBS Haldane Avenue, EM Bypass, Kolkata',
    landmark: 'Science City Gate 2 Parking Yard',
    pinCode: '700046',
    lng: 88.3962,
    lat: 22.5401,
    parkingType: 'Stadium',
    propertyType: 'Public',
    basePricePerHour: 40,
    dailyRate: 250,
    slotsCount: 35,
    operatingHours: '08:00 - 21:00',
    amenities: ['CCTV', 'Lighting', 'Security Guard', 'Wheelchair Access', 'Washroom'],
    rating: 4.5,
    totalRatings: 180
  },

  // 26. Ruby
  {
    area: 'Ruby',
    name: 'Ruby General Hospital Visitors Bay',
    address: 'Kasba Golpark, EM Bypass, Kolkata',
    landmark: 'Adjacent to Ruby Hospital Emergency Gate',
    pinCode: '700078',
    lng: 88.4026,
    lat: 22.5126,
    parkingType: 'Hospital',
    propertyType: 'Commercial',
    basePricePerHour: 40,
    dailyRate: 280,
    slotsCount: 25,
    operatingHours: '24/7',
    amenities: ['CCTV', 'Covered', 'Security Guard', '24x7', 'Wheelchair Access', 'Lighting'],
    rating: 4.4,
    totalRatings: 167
  },

  // 27. Topsia
  {
    area: 'Topsia',
    name: 'Topsia Leather Complex Secured Yard',
    address: 'Topsia Road South, Near PC Chandra Gardens, Kolkata',
    landmark: 'Near Mirania Gardens Crossing',
    pinCode: '700046',
    lng: 88.3880,
    lat: 22.5350,
    parkingType: 'Office',
    propertyType: 'Commercial',
    basePricePerHour: 35,
    dailyRate: 240,
    slotsCount: 22,
    operatingHours: '07:00 - 22:00',
    amenities: ['CCTV', 'Lighting', 'Security Guard'],
    rating: 4.0,
    totalRatings: 55
  },

  // 28. Tangra
  {
    area: 'Tangra',
    name: 'Tangra Chinatown Dining & Parking Lot',
    address: 'Matheswartala Road, Chinatown, Tangra, Kolkata',
    landmark: 'Near Beijing Restaurant Crossing',
    pinCode: '700015',
    lng: 88.3877,
    lat: 22.5492,
    parkingType: 'Market',
    propertyType: 'Commercial',
    basePricePerHour: 40,
    dailyRate: 280,
    slotsCount: 24,
    operatingHours: '11:00 - 23:45',
    amenities: ['CCTV', 'Lighting', 'Security Guard'],
    rating: 4.3,
    totalRatings: 118
  },

  // 29. Phoolbagan
  {
    area: 'Phoolbagan',
    name: 'Phoolbagan Metro & CIT Road Parking Bay',
    address: 'CIT Road, Scheme VI-M, Phoolbagan, Kolkata',
    landmark: 'Phoolbagan Metro Station Gate 1',
    pinCode: '700054',
    lng: 88.3887,
    lat: 22.5714,
    parkingType: 'Metro',
    propertyType: 'Public',
    basePricePerHour: 35,
    dailyRate: 240,
    slotsCount: 24,
    operatingHours: '05:30 - 23:45',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7'],
    rating: 4.2,
    totalRatings: 94
  },

  // 30. Belgachia
  {
    area: 'Belgachia',
    name: 'Belgachia Metro Terminal Commuter Lot',
    address: 'Belgachia Road, Near R.G. Kar Medical College, Kolkata',
    landmark: 'Belgachia Metro Station Entrance',
    pinCode: '700037',
    lng: 88.3842,
    lat: 22.6053,
    parkingType: 'Metro',
    propertyType: 'Public',
    basePricePerHour: 30,
    dailyRate: 200,
    slotsCount: 22,
    operatingHours: '05:30 - 23:45',
    amenities: ['CCTV', 'Lighting', 'Security Guard', '24x7'],
    rating: 4.1,
    totalRatings: 73
  }
];

// Helper to distribute vehicle categories
const SLOT_CATEGORIES = [
  { category: 'Sedan', prefix: 'SD', share: 0.40 },
  { category: 'SUV', prefix: 'SUV', share: 0.25 },
  { category: 'Hatchback', prefix: 'HB', share: 0.15 },
  { category: 'EV', prefix: 'EV', share: 0.10 },
  { category: 'Bike', prefix: 'BK', share: 0.05 },
  { category: 'Handicap', prefix: 'HC', share: 0.05 }
];

async function seedKolkataParking() {
  console.log('====================================================');
  console.log('🚗 KOLKATA PARKING MARKETPLACE DEV SEED SYSTEM');
  console.log('====================================================');
  console.log('Notice: Generating TEST/DEMO parking data for Kolkata.');
  console.log('Target database: MongoDB Atlas (smart_parking)\n');

  let conn;
  try {
    conn = await connectDB();

    // ─────────────────────────────────────────
    // STEP A: Ensure Providers & Wallets Exist
    // ─────────────────────────────────────────
    console.log('Step 1: Setting up Demo Kolkata Providers...');
    const providerIds = [];

    const defaultHashedPassword = await bcrypt.hash('provider123', 10);

    for (const p of DEMO_PROVIDERS) {
      let user = await User.findOne({ email: p.email });
      if (!user) {
        user = await User.create({
          fullName: p.fullName,
          email: p.email,
          password: defaultHashedPassword,
          role: 'PROVIDER',
          status: 'ACTIVE',
          verificationStatus: 'Approved',
          phone: p.phone,
          businessName: p.businessName,
          businessType: p.businessType,
          termsAccepted: true
        });
        console.log(`  + Created provider: ${p.fullName} (${p.email})`);
      } else {
        user.role = 'PROVIDER';
        user.status = 'ACTIVE';
        user.verificationStatus = 'Approved';
        await user.save();
      }

      // Ensure Wallet exists
      let wallet = await Wallet.findOne({ ownerId: user._id });
      if (!wallet) {
        wallet = await Wallet.create({
          ownerId: user._id,
          ownerType: 'Provider',
          balance: p.initialWalletBalance,
          currency: 'INR'
        });
      }
      user.walletId = wallet._id;
      await user.save();

      // Ensure IoT Configuration exists
      await IoTConfiguration.findOneAndUpdate(
        { providerId: user._id },
        { providerId: user._id, iotMode: true, communicationType: 'HTTP' },
        { upsert: true }
      );

      providerIds.push(user._id);
    }

    console.log(`  ✓ ${providerIds.length} Providers configured with active wallets.\n`);

    // ─────────────────────────────────────────
    // STEP B: Safe Cleanup of Previous Demo Kolkata Zones
    // (Preserves all real user accounts, admins, drivers, and bookings)
    // ─────────────────────────────────────────
    console.log('Step 2: Cleaning up existing demo Kolkata parking facilities...');
    const existingDemoZones = await ParkingZone.find({
      $or: [
        { description: /\[DEMO-KOLKATA-SEED\]/ },
        { city: 'Kolkata' }
      ]
    });

    if (existingDemoZones.length > 0) {
      const zoneIds = existingDemoZones.map(z => z._id);
      await ParkingSlot.deleteMany({ zoneId: { $in: zoneIds } });
      await ParkingZone.deleteMany({ _id: { $in: zoneIds } });
      console.log(`  ✓ Removed ${existingDemoZones.length} previous demo Kolkata zones and their slots.`);
    } else {
      console.log('  ✓ No previous demo Kolkata zones found.');
    }

    // ─────────────────────────────────────────
    // STEP C: Seed Facilities & Slots
    // ─────────────────────────────────────────
    console.log('\nStep 3: Seeding realistic Kolkata parking facilities and slots...');

    let totalSlotsCount = 0;
    let availableSlotsCount = 0;
    let occupiedSlotsCount = 0;
    let reservedSlotsCount = 0;
    let maintenanceSlotsCount = 0;
    const areasCoveredSet = new Set();

    for (let i = 0; i < KOLKATA_FACILITIES.length; i++) {
      const f = KOLKATA_FACILITIES[i];
      const assignedProviderId = providerIds[i % providerIds.length];
      areasCoveredSet.add(f.area);

      // Create Parking Zone
      const zone = await ParkingZone.create({
        providerId: assignedProviderId,
        name: f.name,
        address: f.address,
        landmark: f.landmark,
        city: 'Kolkata',
        state: 'West Bengal',
        pinCode: f.pinCode,
        location: {
          type: 'Point',
          coordinates: [f.lng, f.lat]
        },
        parkingType: f.parkingType,
        propertyType: f.propertyType,
        basePricePerHour: f.basePricePerHour,
        hourlyPrice: f.basePricePerHour,
        dailyRate: f.dailyRate,
        dailyPrice: f.dailyRate,
        dynamicPricingMultiplier: 1.0,
        totalSlots: f.slotsCount,
        availableSlots: f.slotsCount, // Will update after slots are generated
        isApproved: true,
        status: 'Active',
        isArchived: false,
        rating: f.rating,
        totalRatings: f.totalRatings,
        amenities: f.amenities,
        isCovered: f.amenities.includes('Covered'),
        hasEVCharging: f.amenities.includes('EV Charging'),
        hasSecurityGuard: f.amenities.includes('Security Guard'),
        hasWashroom: f.amenities.includes('Washroom'),
        hasWheelchairAccess: f.amenities.includes('Wheelchair Access'),
        hasCCTV: f.amenities.includes('CCTV'),
        operatingHours: f.operatingHours,
        description: `[DEMO-KOLKATA-SEED] ${f.name} located in ${f.area}, Kolkata. Official test/demo marketplace facility.`
      });

      // Generate Slots with varied realistic states
      const slotsToInsert = [];
      let zoneOccupied = 0;
      let zoneReserved = 0;
      let zoneMaintenance = 0;

      let slotNum = 1;
      for (const cat of SLOT_CATEGORIES) {
        const countForCat = Math.max(1, Math.round(f.slotsCount * cat.share));

        for (let j = 0; j < countForCat; j++) {
          if (slotsToInsert.length >= f.slotsCount) break;

          // Varied realistic distribution:
          // ~65% Available, ~23% Occupied, ~8% Reserved, ~4% Under Maintenance
          const rand = Math.random();
          let isOccupied = false;
          let isReserved = false;
          let isUnderMaintenance = false;

          if (rand < 0.23) {
            isOccupied = true;
            zoneOccupied++;
          } else if (rand < 0.31) {
            isReserved = true;
            zoneReserved++;
          } else if (rand < 0.35) {
            isUnderMaintenance = true;
            zoneMaintenance++;
          }

          const identifier = `${cat.prefix}-${String(slotNum).padStart(3, '0')}`;
          slotNum++;

          slotsToInsert.push({
            zoneId: zone._id,
            slotIdentifier: identifier,
            vehicleCategory: cat.category,
            isOccupied,
            isReserved,
            isUnderMaintenance,
            isEV: cat.category === 'EV',
            isCovered: zone.isCovered,
            isActive: !isUnderMaintenance,
            floor: j % 2 === 0 ? 'Ground' : 'B1',
            dimensions: cat.category === 'Bike' ? '2m x 1m' : (cat.category === 'SUV' ? '5.5m x 2.8m' : '5m x 2.5m')
          });
        }
      }

      await ParkingSlot.insertMany(slotsToInsert);

      // Re-calculate zone capacity accurately
      const zoneAvailable = Math.max(0, slotsToInsert.length - zoneOccupied - zoneMaintenance);
      zone.totalSlots = slotsToInsert.length;
      zone.availableSlots = zoneAvailable;
      await zone.save();

      totalSlotsCount += slotsToInsert.length;
      availableSlotsCount += zoneAvailable;
      occupiedSlotsCount += zoneOccupied;
      reservedSlotsCount += zoneReserved;
      maintenanceSlotsCount += zoneMaintenance;

      process.stdout.write(`  [${i + 1}/${KOLKATA_FACILITIES.length}] Seeded ${f.name.padEnd(42)} (${zoneAvailable}/${slotsToInsert.length} free)\n`);
    }

    // Ensure 2dsphere index is fully synchronized
    await ParkingZone.createIndexes();

    // ─────────────────────────────────────────
    // STEP D: FINAL VERIFICATION SUMMARY
    // ─────────────────────────────────────────
    console.log('\n====================================================');
    console.log('✅ KOLKATA PARKING MARKETPLACE SEED COMPLETE');
    console.log('====================================================');
    console.log(`Parking facilities : ${KOLKATA_FACILITIES.length}`);
    console.log(`Total slots        : ${totalSlotsCount}`);
    console.log(`Available          : ${availableSlotsCount}`);
    console.log(`Occupied           : ${occupiedSlotsCount}`);
    console.log(`Reserved           : ${reservedSlotsCount}`);
    console.log(`Under Maintenance  : ${maintenanceSlotsCount}`);
    console.log(`Areas covered      : ${areasCoveredSet.size}`);
    console.log(`Areas list         :\n  ${Array.from(areasCoveredSet).join(', ')}`);
    console.log('====================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seeding failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  seedKolkataParking();
}

module.exports = seedKolkataParking;
