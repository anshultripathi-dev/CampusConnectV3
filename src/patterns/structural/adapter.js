// ---- ADAPTER PATTERN ----
// The campus's legacy ID-card/attendance system returns clunky, differently
// shaped records. LegacyIdCardAdapter translates that old format into the
// clean Reporter shape the rest of the app expects, without touching the
// legacy system itself.

// Simulates a legacy third-party system we cannot modify.
class LegacyIdCardSystem {
  fetchCardRecord(cardNo) {
    // Legacy system uses cryptic short keys and a different structure.
    return {
      cno: cardNo,
      nm: 'Student ' + cardNo.slice(-3),
      typ: cardNo.startsWith('S') ? 'STU' : 'STF',
      blk_hostel: 'HC',
    };
  }
}

// The interface the rest of our app actually wants to work with.
class LegacyIdCardAdapter {
  constructor() {
    this.legacySystem = new LegacyIdCardSystem();
  }

  getReporterProfile(cardNo) {
    const record = this.legacySystem.fetchCardRecord(cardNo);
    return {
      cardNo: record.cno,
      name: record.nm,
      role: record.typ === 'STU' ? 'Student' : 'Staff',
      hostelBlock: record.blk_hostel || null,
    };
  }
}

module.exports = { LegacyIdCardAdapter };
