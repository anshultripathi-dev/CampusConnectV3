// ---- FLYWEIGHT PATTERN ----
// Equipment metadata (name, type, icon) is identical every time a piece of
// equipment is referenced across thousands of bookings. EquipmentFlyweightFactory
// caches one shared object per equipment id instead of letting every booking
// carry its own duplicate copy of that metadata.

class EquipmentFlyweight {
  constructor(id, name, type) {
    this.id = id;
    this.name = name;
    this.type = type;
  }
}

class EquipmentFlyweightFactory {
  constructor(equipmentSeed) {
    this.pool = new Map();
    for (const e of equipmentSeed) {
      this.pool.set(e.id, new EquipmentFlyweight(e.id, e.name, e.type));
    }
    this.reuseCount = 0;
  }

  get(id) {
    if (this.pool.has(id)) {
      this.reuseCount++; // demonstrates that we're reusing, not recreating
      return this.pool.get(id);
    }
    throw new Error(`Unknown equipment id: ${id}`);
  }

  resolveMany(ids) {
    return ids.map(id => this.get(id));
  }

  stats() {
    return { distinctObjects: this.pool.size, timesReused: this.reuseCount };
  }
}

module.exports = { EquipmentFlyweightFactory };
