/**
 * Real-Time Smart Parking Simulator
 * 
 * Simulates occupancy changes across all seeded zones.
 * Sends HTTP requests to backend to persist updates and broadcast WebSocket events.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const http = require('http');
const ParkingZone = require('../models/ParkingZone');
const ParkingSlot = require('../models/ParkingSlot');

const BACKEND_PORT = process.env.PORT || 5000;
const SIMULATION_INTERVAL = 6000; // tick every 6 seconds

async function startSimulation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Simulator connected to MongoDB.');

    const zones = await ParkingZone.find({ status: 'Active' });
    if (zones.length === 0) {
      console.log('No active parking zones found to simulate. Run "node seed.js" first.');
      process.exit(0);
    }
    console.log(`Loaded ${zones.length} zones for real-time occupancy simulation.`);

    function getTimeContext() {
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      const isWeekend = day === 0 || day === 6;
      const isPeakMorning = hour >= 8 && hour <= 10;
      const isPeakEvening = hour >= 17 && hour <= 19;
      const isNight = hour >= 22 || hour <= 5;
      const isLunchTime = hour >= 12 && hour <= 14;
      return { hour, isWeekend, isPeakMorning, isPeakEvening, isNight, isLunchTime };
    }

    async function sendUpdate(zoneId, slotId, isOccupied) {
      return new Promise((resolve) => {
        const data = JSON.stringify({ zoneId, slotId, isOccupied });
        const req = http.request({
          hostname: '127.0.0.1',
          port: BACKEND_PORT,
          path: '/api/v1/iot/simulate-update',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body || '{}')));
        });

        req.on('error', () => resolve({ status: 'failed', message: 'Backend unreachable' }));
        req.write(data);
        req.end();
      });
    }

    async function simulateTick() {
      const ctx = getTimeContext();
      // Select 4-10 random zones to tick
      const activeCount = Math.floor(Math.random() * 7) + 4;
      const shuffled = [...zones].sort(() => Math.random() - 0.5);
      const selectedZones = shuffled.slice(0, activeCount);

      let totalUpdates = 0;

      for (const zone of selectedZones) {
        const slots = await ParkingSlot.find({ zoneId: zone._id, isUnderMaintenance: false });
        if (slots.length === 0) continue;

        // Base occupancy chance
        let occupyChance = 0.5;
        const type = zone.parkingType;

        if (ctx.isPeakMorning) occupyChance = (type === 'Office' || type === 'Metro') ? 0.85 : 0.6;
        else if (ctx.isPeakEvening) occupyChance = (type === 'Mall' || type === 'Market') ? 0.85 : 0.5;
        else if (ctx.isNight) occupyChance = (type === 'Residential' || type === 'Airport') ? 0.75 : 0.15;
        else if (ctx.isLunchTime) occupyChance = (type === 'Mall' || type === 'Market') ? 0.7 : 0.45;

        if (ctx.isWeekend) {
          if (['Mall', 'Public', 'Market', 'Stadium'].includes(type)) occupyChance += 0.2;
          if (['Office', 'University'].includes(type)) occupyChance -= 0.35;
        }

        occupyChance = Math.max(0.1, Math.min(0.9, occupyChance));

        const freeSlots = slots.filter(s => !s.isOccupied);
        const occupiedSlots = slots.filter(s => s.isOccupied && !s.currentBookingId);

        // Make 1-3 changes
        const changes = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < changes; i++) {
          if (Math.random() < occupyChance && freeSlots.length > 0) {
            const slot = freeSlots.splice(Math.floor(Math.random() * freeSlots.length), 1)[0];
            if (slot) {
              await sendUpdate(zone._id, slot._id, true);
              totalUpdates++;
            }
          } else if (occupiedSlots.length > 0) {
            const slot = occupiedSlots.splice(Math.floor(Math.random() * occupiedSlots.length), 1)[0];
            if (slot) {
              await sendUpdate(zone._id, slot._id, false);
              totalUpdates++;
            }
          }
        }
      }

      const totalFree = await ParkingSlot.countDocuments({ isOccupied: false });
      const totalOccupied = await ParkingSlot.countDocuments({ isOccupied: true });
      process.stdout.write(`\r[${new Date().toLocaleTimeString()}] Tick completed: Sent ${totalUpdates} updates | Total Free: ${totalFree} | Total Occupied: ${totalOccupied}`);
    }

    console.log(`Starting real-time simulation (interval: ${SIMULATION_INTERVAL}ms)...`);
    setInterval(simulateTick, SIMULATION_INTERVAL);
  } catch (err) {
    console.error('Simulator error:', err);
  }
}

startSimulation();
