require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Wallet = require('./models/Wallet');
const Vehicle = require('./models/Vehicle');
const ParkingZone = require('./models/ParkingZone');
const ParkingSlot = require('./models/ParkingSlot');
const Booking = require('./models/Booking');
const Transaction = require('./models/Transaction');
const Feedback = require('./models/Feedback');
const Notification = require('./models/Notification');
const AuditLog = require('./models/AuditLog');

const AREA_CENTERS = {
  'Sonarpur': { lat: 22.4398, lng: 88.4339 },
  'Baruipur': { lat: 22.3592, lng: 88.4326 },
  'Narendrapur': { lat: 22.4411, lng: 88.3970 },
  'Garia': { lat: 22.4707, lng: 88.3855 },
  'Kamalgazi': { lat: 22.4578, lng: 88.3920 },
  'Boral': { lat: 22.4491, lng: 88.3752 },
  'Rajpur': { lat: 22.4348, lng: 88.4069 },
  'Harinavi': { lat: 22.4277, lng: 88.4087 },
  'Subhasgram': { lat: 22.4042, lng: 88.4311 },
  'Mahamayatala': { lat: 22.4589, lng: 88.3995 },
  'Patuli': { lat: 22.4764, lng: 88.3897 },
  'Baishnabghata': { lat: 22.4795, lng: 88.3814 },
  'Ruby': { lat: 22.5126, lng: 88.4026 },
  'Mukundapur': { lat: 22.4853, lng: 88.4116 },
  'EM Bypass': { lat: 22.5200, lng: 88.4010 },
  'Jadavpur': { lat: 22.4955, lng: 88.3709 },
  'Santoshpur': { lat: 22.4984, lng: 88.3891 },
  'Baghajatin': { lat: 22.4820, lng: 88.3789 },
  'New Garia': { lat: 22.4721, lng: 88.3986 },
  'Kalikapur': { lat: 22.4998, lng: 88.4020 },
  'Survey Park': { lat: 22.4930, lng: 88.3960 },
  'Naktala': { lat: 22.4766, lng: 88.3698 },
  'Tollygunge': { lat: 22.4930, lng: 88.3468 },
  'Behala': { lat: 22.4990, lng: 88.3180 },
  'Kasba': { lat: 22.5164, lng: 88.3831 }
};

const AREAS = Object.keys(AREA_CENTERS);

const PARKING_NAMES = [
  'Junction Smart Parking Plaza',
  'Commercial Hub Parking Complex',
  'Corporate Tech Garage',
  'Municipal Multi-Level Parking Lot',
  'Metro Adjacent Transit Parking',
  'Supermarket Secured Bay',
  'Medical Center Visitor Lot',
  'Central Arcade Parking Ground',
  'Elite Covered Parking Zone',
  'Eco EV Charging & Parking Station'
];

const PARKING_TYPES = ['Public', 'Private', 'Mall', 'Railway', 'Airport', 'Hospital', 'Office', 'Residential', 'Street', 'Stadium', 'University', 'Metro', 'Market'];
const PROPERTY_TYPES = ['Public', 'Private', 'Residential', 'Commercial', 'Mall', 'Office', 'Hospital', 'School', 'Hotel', 'Apartment', 'Others'];

const VEHICLE_CATEGORIES = ['Bike', 'Scooter', 'Sedan', 'Hatchback', 'SUV', 'Luxury Car', 'EV', 'Mini Truck', 'Truck', 'Bus', 'Handicap'];

const SLOT_RATES = {
  Bike: { w: '2m', l: '1m', prefix: 'BK', multiplier: 0.5 },
  Scooter: { w: '2m', l: '1m', prefix: 'SC', multiplier: 0.5 },
  Hatchback: { w: '4.5m', l: '2.2m', prefix: 'HB', multiplier: 0.8 },
  Sedan: { w: '5m', l: '2.5m', prefix: 'SD', multiplier: 1.0 },
  SUV: { w: '5.5m', l: '2.8m', prefix: 'SUV', multiplier: 1.2 },
  'Luxury Car': { w: '5.8m', l: '3m', prefix: 'LX', multiplier: 1.8 },
  EV: { w: '5m', l: '2.5m', prefix: 'EV', multiplier: 1.1 },
  'Mini Truck': { w: '6m', l: '3m', prefix: 'MT', multiplier: 1.5 },
  Truck: { w: '12m', l: '3.5m', prefix: 'TR', multiplier: 2.2 },
  Bus: { w: '14m', l: '3.6m', prefix: 'BUS', multiplier: 2.5 },
  Handicap: { w: '5.5m', l: '3.2m', prefix: 'HC', multiplier: 0.8 }
};

const AMENITIES_LIST = ['CCTV', 'Covered', 'EV Charging', 'Security Guard', 'Washroom', 'Wheelchair Access', '24x7', 'Lighting'];

const FIRST_NAMES = ['Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Sai', 'Ishaan', 'Krishna', 'Pranav', 'Aryan', 'Kabir', 'Ananya', 'Diya', 'Priya', 'Aditi', 'Kiara', 'Ira', 'Avani', 'Riya', 'Aanya', 'Saanvi'];
const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Sen', 'Das', 'Banerjee', 'Mukherjee', 'Chatterjee', 'Roy', 'Bose', 'Dutta', 'Ghosh', 'Choudhury', 'Mehta', 'Joshi', 'Patel', 'Reddy', 'Nair', 'Pillai', 'Rao'];

const VEHICLE_MAKES = {
  Bike: ['Royal Enfield', 'Honda', 'Yamaha', 'Bajaj', 'TVS'],
  Scooter: ['Honda', 'TVS', 'Suzuki', 'Ather', 'Ola'],
  Sedan: ['Honda', 'Hyundai', 'Maruti Suzuki', 'Skoda', 'Honda'],
  Hatchback: ['Maruti Suzuki', 'Hyundai', 'Tata', 'Renault'],
  SUV: ['Mahindra', 'Tata', 'Hyundai', 'Toyota', 'Kia'],
  'Luxury Car': ['Mercedes-Benz', 'BMW', 'Audi', 'Jaguar'],
  EV: ['Tata', 'MG', 'BYD', 'Hyundai'],
  'Mini Truck': ['Tata', 'Mahindra', 'Ashok Leyland'],
  Truck: ['Tata', 'BharatBenz', 'Eicher'],
  Bus: ['Tata', 'Ashok Leyland', 'Volvo'],
  Handicap: ['Maruti Suzuki', 'Hyundai']
};

const VEHICLE_MODELS = {
  'Royal Enfield': ['Classic 350', 'Bullet 350', 'Meteor 350'],
  Honda: ['Activa 6G', 'City', 'Civic', 'SP 125', 'Amaze'],
  Yamaha: ['MT-15', 'R15', 'FZ-S'],
  Bajaj: ['Pulsar 150', 'Pulsar NS200', 'Chetak'],
  TVS: ['Jupiter', 'Ntorq 125', 'Apache RTR 160', 'iQube'],
  Suzuki: ['Access 125', 'Burgman Street'],
  Ather: ['450X', 'Apex'],
  Ola: ['S1 Pro', 'S1 Air'],
  Hyundai: ['i20', 'Creta', 'Verna', 'Kona EV', 'Venue'],
  'Maruti Suzuki': ['Swift', 'Baleno', 'Dzire', 'Ertiga', 'WagonR'],
  Skoda: ['Slavia', 'Kushaq'],
  Tata: ['Nexon EV', 'Punch', 'Harrier', 'Safari', 'Tiago EV', 'Ace'],
  Renault: ['Kwid', 'Triber'],
  Mahindra: ['Thar', 'XUV700', 'Scorpio-N', 'Bolero'],
  Toyota: ['Fortuner', 'Innova Crysta', 'Glanza'],
  Kia: ['Seltos', 'Sonet', 'EV6'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'GLA'],
  BMW: ['3 Series', '5 Series', 'X3'],
  Audi: ['A4', 'A6', 'Q3'],
  Jaguar: ['XF', 'F-Pace'],
  MG: ['ZS EV', 'Comet EV'],
  BYD: ['Atto 3', 'E6'],
  'Ashok Leyland': ['Dost', 'Bada Dost'],
  Eicher: ['Pro 2049', 'Pro 3015'],
  Volvo: ['9400', '9600'],
  BharatBenz: ['1617R', '2823R']
};

const REVIEW_COMMENTS = {
  Positive: [
    'Excellent experience. Highly secured place with good lighting.',
    'EV charging worked flawlessly. Very polite security guards.',
    'Extremely easy to book and navigate. Entrance barrier scanned QR instantly.',
    'Spacious slots, wheelchair accessibility was helpful for my father.',
    'Clean slots, CCTV protection made me feel safe leaving my luxury car here.',
    'Great value for money. Covered slots kept the car cool.',
    'Very close to the metro station. Commute was so easy.',
    'Clean restrooms and helpful staff. Highly recommended!'
  ],
  Neutral: [
    'Decent place but dynamic pricing makes it expensive during peak hours.',
    'Parking was fine but the entrance gate was a bit narrow.',
    'Average service. CCTV was visible, but lighting could be improved.',
    'Fairly crowded on weekends, had to wait for 2 minutes at exit barrier.',
    'Good location, but washroom could be cleaner.'
  ],
  Negative: [
    'Very poor management. Somebody blocked my reserved slot.',
    'Exit barrier failed to read QR, had to wait 15 minutes for manual check.',
    'Overpriced during weekends. Guard was unresponsive.',
    'No proper lighting in basement floors. Felt unsafe.',
    'CCTV was broken. Avoid if parking a premium vehicle.'
  ]
};

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomNumber(min, max, decimalPlaces = 0) {
  const value = Math.random() * (max - min) + min;
  return parseFloat(value.toFixed(decimalPlaces));
}

function generateRandomName() {
  return `${getRandomElement(FIRST_NAMES)} ${getRandomElement(LAST_NAMES)}`;
}

function generateBusinessName(fullName) {
  const companySuffix = ['Parking Solutions', 'Valet Services', 'Properties', 'Holding Ltd', 'AutoPark Plaza', 'Space Management'];
  return `${fullName.split(' ')[1]} ${getRandomElement(companySuffix)}`;
}

async function seedDatabase() {
  try {
    console.log('Connecting to MongoDB Atlas Cluster...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully.');

    console.log('Cleaning existing collection data...');
    await Promise.all([
      User.deleteMany({}),
      Wallet.deleteMany({}),
      Vehicle.deleteMany({}),
      ParkingZone.deleteMany({}),
      ParkingSlot.deleteMany({}),
      Booking.deleteMany({}),
      Transaction.deleteMany({}),
      Feedback.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({})
    ]);
    console.log('Collections cleared.');

    // Create default administrative and testing users
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await User.create({
      fullName: 'Marketplace Administrator',
      email: 'admin@smartparking.in',
      password: hashedAdminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
      phone: '+91 9999999999'
    });

    const hashedDriverPassword = await bcrypt.hash('driver123', 10);
    const defaultDriver = await User.create({
      fullName: 'Amit Sharma',
      email: 'driver@smartparking.in',
      password: hashedDriverPassword,
      role: 'DRIVER',
      status: 'ACTIVE',
      phone: '+91 9876543210',
      preferredTheme: 'dark',
      score: 520
    });

    const defaultDriverWallet = await Wallet.create({
      ownerId: defaultDriver._id,
      ownerType: 'User',
      balance: 10000,
      currency: 'INR'
    });
    defaultDriver.walletId = defaultDriverWallet._id;
    await defaultDriver.save();

    const hashedProvPassword = await bcrypt.hash('provider123', 10);
    const defaultProvider = await User.create({
      fullName: 'Rajesh Gupta',
      email: 'provider@smartparking.in',
      password: hashedProvPassword,
      role: 'PROVIDER',
      status: 'ACTIVE',
      phone: '+91 8888888888',
      governmentId: 'ABCDE1234F',
      bankAccount: '123456789012',
      upiId: 'rajesh@okaxis',
      businessName: 'Gupta AutoPark Plaza',
      businessType: 'Partnership'
    });

    const defaultProviderWallet = await Wallet.create({
      ownerId: defaultProvider._id,
      ownerType: 'Provider',
      balance: 50000,
      currency: 'INR'
    });
    defaultProvider.walletId = defaultProviderWallet._id;
    await defaultProvider.save();

    console.log('Default Admin, Driver, and Provider users created.');

    // 1. Create 100 Providers
    console.log('Creating 100 verified parking providers...');
    const providers = [defaultProvider];
    const providerWallets = [defaultProviderWallet];

    for (let i = 1; i <= 99; i++) {
      const name = generateRandomName();
      const pEmail = `provider_${i}@smartparking.in`;
      const businessName = generateBusinessName(name);
      const phone = `+91 ${getRandomNumber(6000000000, 9999999999)}`;
      const bankAccount = String(getRandomNumber(100000000000, 999999999999));
      const upiId = `${name.toLowerCase().replace(' ', '')}@okaxis`;

      const provider = await User.create({
        fullName: name,
        email: pEmail,
        password: hashedProvPassword,
        role: 'PROVIDER',
        status: 'ACTIVE',
        verificationStatus: 'Approved',
        phone,
        governmentId: `ABCDE${getRandomNumber(1000, 9999)}F`,
        bankAccount,
        upiId,
        businessName,
        businessType: getRandomElement(['Individual', 'Proprietorship', 'Partnership', 'Private Limited']),
        gstNumber: Math.random() > 0.3 ? `19ABCDE${getRandomNumber(1000, 9999)}F1Z2` : '',
        termsAccepted: true
      });

      const pWallet = await Wallet.create({
        ownerId: provider._id,
        ownerType: 'Provider',
        balance: getRandomNumber(25000, 350000),
        currency: 'INR'
      });

      provider.walletId = pWallet._id;
      await provider.save();

      providers.push(provider);
      providerWallets.push(pWallet);
    }
    console.log('100 Providers seeded.');

    // 2. Create 300 Drivers and Vehicles
    console.log('Creating 300 driver users and vehicles...');
    const drivers = [defaultDriver];
    const driverWallets = [defaultDriverWallet];
    const vehicles = [];

    // Create default testing vehicles first
    const defaultCar = await Vehicle.create({
      userId: defaultDriver._id,
      make: 'Hyundai',
      model: 'i20',
      licensePlate: 'WB-02-AB-1234',
      vehicleType: 'Sedan',
      isEV: false,
      color: 'White'
    });
    const defaultEv = await Vehicle.create({
      userId: defaultDriver._id,
      make: 'Tata',
      model: 'Nexon EV',
      licensePlate: 'WB-06-XY-5678',
      vehicleType: 'EV',
      isEV: true,
      color: 'Teal Blue'
    });
    vehicles.push(defaultCar, defaultEv);

    for (let i = 1; i <= 299; i++) {
      const name = generateRandomName();
      const dEmail = `driver_${i}@smartparking.in`;
      const phone = `+91 ${getRandomNumber(6000000000, 9999999999)}`;

      const driver = await User.create({
        fullName: name,
        email: dEmail,
        password: hashedDriverPassword,
        role: 'DRIVER',
        status: 'ACTIVE',
        phone,
        preferredTheme: Math.random() > 0.5 ? 'dark' : 'light',
        score: getRandomNumber(400, 750)
      });

      const dWallet = await Wallet.create({
        ownerId: driver._id,
        ownerType: 'User',
        balance: getRandomNumber(1000, 15000),
        currency: 'INR'
      });

      driver.walletId = dWallet._id;
      await driver.save();

      drivers.push(driver);
      driverWallets.push(dWallet);

      // Vehicles
      const numVehicles = Math.random() > 0.75 ? 2 : 1;
      for (let v = 0; v < numVehicles; v++) {
        const category = getRandomElement(VEHICLE_CATEGORIES);
        const makes = VEHICLE_MAKES[category];
        const make = getRandomElement(makes);
        const model = getRandomElement(VEHICLE_MODELS[make]);
        const isEV = category === 'EV';
        const color = getRandomElement(['White', 'Silver', 'Black', 'Grey', 'Blue', 'Red']);
        const licensePlate = `WB-${getRandomNumber(10, 99)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${getRandomNumber(1000, 9999)}`;

        const vehicle = await Vehicle.create({
          userId: driver._id,
          make,
          model,
          licensePlate,
          vehicleType: category,
          isEV,
          color
        });
        vehicles.push(vehicle);
      }
    }
    console.log('300 Drivers and their vehicle logs seeded.');

    // 3. Create 125 Parking Zones
    console.log('Creating 125 local Parking Zones in South Kolkata areas...');
    const zones = [];

    // Let's create exactly 5 lots per area across 25 areas = 125 lots
    let providerIndex = 0;
    for (const area of AREAS) {
      const center = AREA_CENTERS[area];

      for (let lotIdx = 1; lotIdx <= 5; lotIdx++) {
        const provider = providers[providerIndex % providers.length];
        providerIndex++;

        // Shift coordinates slightly
        const lat = center.lat + getRandomNumber(-0.006, 0.006, 5);
        const lng = center.lng + getRandomNumber(-0.006, 0.006, 5);

        const suffix = PARKING_NAMES[(lotIdx - 1) % PARKING_NAMES.length];
        const lotName = `${area} ${suffix}`;

        const basePrice = Math.floor(getRandomNumber(20, 60)); // 20 to 60 base price
        const totalSlotsCount = Math.floor(getRandomNumber(65, 100)); // Average ~82 slots

        const chosenAmenities = AMENITIES_LIST.filter(() => Math.random() > 0.35);
        if (chosenAmenities.length === 0) chosenAmenities.push('Lighting', 'CCTV');

        // Slot limits configuration
        const bikeSlots = Math.floor(totalSlotsCount * 0.4);
        const carSlots = Math.floor(totalSlotsCount * 0.4);
        const truckSlots = Math.floor(totalSlotsCount * 0.05);
        const busSlots = Math.floor(totalSlotsCount * 0.05);

        const rating = parseFloat(getRandomNumber(3.5, 5.0, 1));
        const totalRatings = Math.floor(getRandomNumber(15, 250));

        const zone = await ParkingZone.create({
          providerId: provider._id,
          name: lotName,
          address: `${Math.floor(getRandomNumber(1, 300))}, Near ${area} Main Crossing, Kolkata`,
          landmark: `Landmark Close to ${area}`,
          city: 'Kolkata',
          state: 'West Bengal',
          pinCode: `7000${Math.floor(getRandomNumber(10, 99))}`,
          location: { type: 'Point', coordinates: [lng, lat] },
          parkingType: getRandomElement(PARKING_TYPES),
          propertyType: getRandomElement(PROPERTY_TYPES),
          basePricePerHour: basePrice,
          hourlyPrice: basePrice,
          dailyPrice: basePrice * 8,
          nightPrice: basePrice + 10,
          weekendPrice: basePrice + 15,
          festivalPrice: basePrice + 25,
          peakHourPrice: basePrice + 20,
          extensionCharges: basePrice + 10,
          dailyRate: basePrice * 8,
          monthlyRate: basePrice * 180,
          dynamicPricingMultiplier: Math.random() > 0.85 ? parseFloat(getRandomNumber(1.1, 1.4, 2)) : 1.0,
          totalSlots: totalSlotsCount,
          availableSlots: totalSlotsCount, // will be decremented by occupied slots
          bikeSlots,
          carSlots,
          busSlots,
          truckSlots,
          vehicleTypesAllowed: ['Bike', 'Scooter', 'Sedan', 'Hatchback', 'SUV', 'Luxury Car', 'EV', 'Mini Truck', 'Truck', 'Bus', 'Handicap'],
          isApproved: true,
          verificationStatus: 'Approved',
          status: 'Active',
          rating,
          totalRatings,
          amenities: chosenAmenities,
          isCovered: chosenAmenities.includes('Covered'),
          hasEVCharging: chosenAmenities.includes('EV Charging'),
          hasDisabledParking: chosenAmenities.includes('Wheelchair Access'),
          hasCCTV: chosenAmenities.includes('CCTV'),
          hasSecurity: chosenAmenities.includes('Security Guard'),
          hasLighting: chosenAmenities.includes('Lighting'),
          hasSecurityGuard: chosenAmenities.includes('Security Guard'),
          hasWashroom: chosenAmenities.includes('Washroom'),
          hasWheelchairAccess: chosenAmenities.includes('Wheelchair Access'),
          hasNightParking: true,
          dimensions: '45m x 35m',
          contact: `+91 ${Math.floor(getRandomNumber(7000000000, 9999999999))}`,
          description: `Premium and secure parking location situated in ${area}, Kolkata. Controlled by automated IoT gate barriers with 24x7 security, lighting, and optional EV charging stations.`
        });
        zones.push(zone);
      }
    }
    console.log('125 Parking Zones seeded.');

    // 4. Create Slots (8,000 to 15,000 slots)
    console.log('Creating Parking Slots for all zones...');
    const allSlots = [];

    for (const zone of zones) {
      let slotsAdded = 0;

      for (let s = 1; s <= zone.totalSlots; s++) {
        let category = 'Sedan';
        // Distribute slot categories
        if (s <= zone.bikeSlots) {
          category = getRandomElement(['Bike', 'Scooter']);
        } else if (s <= zone.bikeSlots + zone.carSlots) {
          category = getRandomElement(['Sedan', 'Hatchback', 'SUV', 'Luxury Car']);
        } else if (s <= zone.bikeSlots + zone.carSlots + zone.truckSlots) {
          category = getRandomElement(['Mini Truck', 'Truck']);
        } else if (s <= zone.bikeSlots + zone.carSlots + zone.truckSlots + zone.busSlots) {
          category = 'Bus';
        } else {
          category = getRandomElement(['EV', 'Handicap']);
        }

        const rateData = SLOT_RATES[category];

        // Reserve slots
        const isEmergency = s <= 3; // 3 emergency slots
        const isUnderMaintenance = !isEmergency && Math.random() > 0.95; // random maintenance slots
        const isHandicap = category === 'Handicap';
        const isEV = category === 'EV';
        const isReserved = isEmergency || isHandicap || isEV || (s % 12 === 0);

        allSlots.push({
          zoneId: zone._id,
          slotIdentifier: `${rateData.prefix}-${String(s).padStart(3, '0')}`,
          isOccupied: false,
          isEV,
          currentBookingId: null,
          isUnderMaintenance,
          isReserved,
          isEmergency,
          vehicleCategory: category,
          floor: s > zone.totalSlots * 0.7 ? 'B1' : 'Ground',
          dimensions: `${rateData.l} x ${rateData.w}`,
          isActive: true,
          isCovered: zone.isCovered || Math.random() > 0.4
        });
      }
    }

    console.log(`Inserting ${allSlots.length} Parking Slots...`);
    const slotChunkSize = 2000;
    const insertedSlots = [];
    for (let i = 0; i < allSlots.length; i += slotChunkSize) {
      const chunk = allSlots.slice(i, i + slotChunkSize);
      const docs = await ParkingSlot.insertMany(chunk);
      insertedSlots.push(...docs);
    }
    console.log('Seeded all slots.');

    // Group slots by Zone ID to optimize query lookups
    const slotsMap = {};
    for (const slot of insertedSlots) {
      if (!slotsMap[slot.zoneId]) {
        slotsMap[slot.zoneId] = [];
      }
      slotsMap[slot.zoneId].push(slot);
    }

    // 5. Create Bookings (4000 Historical, 150 Active)
    console.log('Seeding 4000 historical bookings and 150 active bookings...');
    const bookingsData = [];
    const transactionsData = [];
    const feedbacksData = [];

    // Drivers map for lookup
    const driverMap = {};
    for (const driver of drivers) {
      driverMap[driver._id] = driver;
    }
    const driverWalletMap = {};
    for (const wallet of driverWallets) {
      driverWalletMap[wallet.ownerId] = wallet;
    }
    const providerWalletMap = {};
    for (const wallet of providerWallets) {
      providerWalletMap[wallet.ownerId] = wallet;
    }

    const now = new Date();
    let occupancyChanges = {}; // keep track of which zones/slots are taken

    // Generate active live bookings first (150 active bookings)
    console.log('Generating 150 active bookings...');
    for (let i = 0; i < 150; i++) {
      const zone = getRandomElement(zones);
      const zoneSlots = slotsMap[zone._id] || [];
      const freeSlots = zoneSlots.filter(s => !s.isOccupied && !s.isUnderMaintenance && !s.isReserved);
      if (freeSlots.length === 0) continue;

      const slot = getRandomElement(freeSlots);
      const driver = getRandomElement(drivers);
      const driverVehicles = vehicles.filter(v => v.userId.toString() === driver._id.toString());
      const vehicle = driverVehicles.length > 0 ? getRandomElement(driverVehicles) : null;
      if (!vehicle) continue;

      slot.isOccupied = true; // occupy slot

      const startTime = new Date(now.getTime() - getRandomNumber(15, 90) * 60 * 1000);
      const endTime = new Date(startTime.getTime() + getRandomNumber(1, 4) * 60 * 60 * 1000);
      const durationHours = Math.ceil((endTime - startTime) / (3600 * 1000));
      const cost = durationHours * zone.basePricePerHour;

      const bookingId = new mongoose.Types.ObjectId();
      bookingsData.push({
        _id: bookingId,
        userId: driver._id,
        zoneId: zone._id,
        slotId: slot._id,
        vehicleId: vehicle._id,
        vehiclePlate: vehicle.licensePlate,
        status: 'Active',
        startTime,
        endTime,
        totalCost: cost,
        hours: durationHours,
        qrUsed: true,
        qrVersion: 1,
        scanLogs: [{
          action: 'ENTRY',
          gateId: 'MAIN-ENTRY-01',
          timestamp: startTime,
          status: 'SUCCESS',
          ipAddress: '192.168.1.150',
          gpsCoordinates: [zone.location.coordinates[0], zone.location.coordinates[1]]
        }]
      });

      // Update slot occupant state in Mongoose cache
      slot.currentBookingId = bookingId;

      // Add driver wallet debit transaction
      const driverWallet = driverWalletMap[driver._id];
      if (driverWallet) {
        transactionsData.push({
          walletId: driverWallet._id,
          userId: driver._id,
          type: 'debit',
          category: 'booking_payment',
          amount: cost,
          description: `Smart Reservation Fee - Slot ${slot.slotIdentifier} at ${zone.name}`,
          balanceAfter: Math.max(0, driverWallet.balance - cost),
          relatedBookingId: bookingId
        });
        driverWallet.balance = Math.max(0, driverWallet.balance - cost);
      }
    }

    // Generate historical bookings (4000 completed/expired/cancelled)
    console.log('Generating 4000 historical bookings spanning last 3 months...');
    for (let i = 0; i < 4000; i++) {
      const zone = getRandomElement(zones);
      const zoneSlots = slotsMap[zone._id] || [];
      const slot = getRandomElement(zoneSlots);
      const driver = getRandomElement(drivers);
      const driverVehicles = vehicles.filter(v => v.userId.toString() === driver._id.toString());
      const vehicle = driverVehicles.length > 0 ? getRandomElement(driverVehicles) : null;
      if (!vehicle) continue;

      // Random state
      const randomVal = Math.random();
      const status = randomVal > 0.9 ? 'Cancelled' : randomVal > 0.85 ? 'Expired' : 'Completed';

      // Start time in the past 90 days
      const daysAgo = getRandomNumber(1, 90);
      const startTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000 - getRandomNumber(0, 23) * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + getRandomNumber(1, 6) * 60 * 60 * 1000);
      const durationHours = Math.ceil((endTime - startTime) / (3600 * 1000));
      const cost = durationHours * zone.basePricePerHour;

      const actualEndTime = status === 'Completed' ? endTime : null;
      const bookingId = new mongoose.Types.ObjectId();

      bookingsData.push({
        _id: bookingId,
        userId: driver._id,
        zoneId: zone._id,
        slotId: slot._id,
        vehicleId: vehicle._id,
        vehiclePlate: vehicle.licensePlate,
        status,
        startTime,
        endTime,
        actualEndTime,
        totalCost: cost,
        hours: durationHours,
        qrUsed: status === 'Completed',
        qrVersion: 1,
        scanLogs: status === 'Completed' ? [
          {
            action: 'ENTRY',
            gateId: 'MAIN-ENTRY-01',
            timestamp: startTime,
            status: 'SUCCESS',
            ipAddress: '192.168.1.150',
            gpsCoordinates: [zone.location.coordinates[0], zone.location.coordinates[1]]
          },
          {
            action: 'EXIT',
            gateId: 'MAIN-EXIT-01',
            timestamp: endTime,
            status: 'SUCCESS',
            ipAddress: '192.168.1.151',
            gpsCoordinates: [zone.location.coordinates[0], zone.location.coordinates[1]]
          }
        ] : []
      });

      // Wallet Transactions for Driver and Provider
      const driverWallet = driverWalletMap[driver._id];
      if (driverWallet && status !== 'Expired') {
        transactionsData.push({
          walletId: driverWallet._id,
          userId: driver._id,
          type: 'debit',
          category: 'booking_payment',
          amount: cost,
          description: `Reservation Payment - Slot ${slot.slotIdentifier} at ${zone.name}`,
          balanceAfter: Math.max(0, driverWallet.balance - cost),
          relatedBookingId: bookingId
        });
        driverWallet.balance = Math.max(0, driverWallet.balance - cost);
      }

      const providerWallet = providerWalletMap[zone.providerId];
      if (providerWallet && status === 'Completed') {
        transactionsData.push({
          walletId: providerWallet._id,
          userId: zone.providerId,
          type: 'credit',
          category: 'provider_earning',
          amount: cost,
          description: `Payout standard rate - Slot ${slot.slotIdentifier} for booking #${bookingId.toString().slice(-6)}`,
          balanceAfter: providerWallet.balance + cost,
          relatedBookingId: bookingId
        });
        providerWallet.balance += cost;
      }

      // Generate Feedbacks (Reviews)
      if (status === 'Completed' && Math.random() > 0.4) {
        const sentiment = Math.random() > 0.85 ? 'Negative' : Math.random() > 0.7 ? 'Neutral' : 'Positive';
        const rating = sentiment === 'Positive' ? getRandomNumber(4, 5) : sentiment === 'Neutral' ? 3 : getRandomNumber(1, 2);

        feedbacksData.push({
          bookingId: bookingId,
          userId: driver._id,
          zoneId: zone._id,
          rating,
          comments: getRandomElement(REVIEW_COMMENTS[sentiment]),
          sentimentLabel: sentiment
        });
      }
    }

    console.log('Writing Bookings to DB...');
    const bookingChunkSize = 1000;
    for (let i = 0; i < bookingsData.length; i += bookingChunkSize) {
      await Booking.insertMany(bookingsData.slice(i, i + bookingChunkSize));
    }

    console.log('Writing Wallet Transactions...');
    for (let i = 0; i < transactionsData.length; i += bookingChunkSize) {
      await Transaction.insertMany(transactionsData.slice(i, i + bookingChunkSize));
    }

    console.log('Writing Reviews/Feedbacks...');
    for (let i = 0; i < feedbacksData.length; i += bookingChunkSize) {
      await Feedback.insertMany(feedbacksData.slice(i, i + bookingChunkSize));
    }

    // Save wallet balance changes
    console.log('Saving updated wallet balances...');
    await Promise.all([
      ...driverWallets.map(w => w.save()),
      ...providerWallets.map(w => w.save())
    ]);

    // 6. Update Mongoose slot occupancies and update availableSlots count on zones
    console.log('Updating Slot status and Zone occupancy availability...');
    const allOccupiedSlots = allSlots.filter(s => s.isOccupied || s.isUnderMaintenance);

    // Save updated slot objects
    console.log('Syncing slot states with Mongoose...');
    for (let i = 0; i < insertedSlots.length; i += slotChunkSize) {
      const chunk = insertedSlots.slice(i, i + slotChunkSize);
      const bulkOps = chunk.map(slot => ({
        updateOne: {
          filter: { _id: slot._id },
          update: {
            $set: {
              isOccupied: slot.isOccupied,
              currentBookingId: slot.currentBookingId
            }
          }
        }
      }));
      await ParkingSlot.bulkWrite(bulkOps);
    }

    // Update zone available slots
    console.log('Recalculating Zone capacity metrics...');
    for (const zone of zones) {
      const zoneSlots = slotsMap[zone._id] || [];
      const occupiedCount = zoneSlots.filter(s => s.isOccupied || s.isUnderMaintenance).length;
      zone.availableSlots = Math.max(0, zone.totalSlots - occupiedCount);
      await zone.save();
    }

    // 7. Seed Notifications and Audit Logs
    console.log('Seeding notifications and audit records...');
    const notificationsData = [];
    const auditLogsData = [];

    for (let i = 0; i < 50; i++) {
      const driver = getRandomElement(drivers);
      const zone = getRandomElement(zones);

      notificationsData.push({
        userId: driver._id,
        title: 'Reservation Confirmed',
        message: `Your booking at ${zone.name} is successfully confirmed. Use the QR code at the main entry gate.`,
        type: 'INFO',
        read: Math.random() > 0.4
      });

      auditLogsData.push({
        userId: driver._id,
        action: 'BARRIER_ENTRY',
        details: `Barrier main gate scanned successfully for driver ${driver.fullName} at ${zone.name}.`
      });
    }

    await Notification.insertMany(notificationsData);
    await AuditLog.insertMany(auditLogsData);

    console.log('\n============================================================');
    console.log('🎉 SMART PARKING MARKETPLACE SEEDING COMPLETE!');
    console.log(`   - Verified Providers: ${providers.length}`);
    console.log(`   - Driver Profiles: ${drivers.length}`);
    console.log(`   - Vehicle Registered: ${vehicles.length}`);
    console.log(`   - Parking Zones Localized: ${zones.length}`);
    console.log(`   - Slots Configured: ${insertedSlots.length}`);
    console.log(`   - Bookings Logged: ${bookingsData.length}`);
    console.log(`   - Customer Feedbacks: ${feedbacksData.length}`);
    console.log('============================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('Seeding operation failed:', err);
    process.exit(1);
  }
}

seedDatabase();
