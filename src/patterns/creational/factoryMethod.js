// ---- FACTORY METHOD PATTERN ----
// Within the Maintenance category, the exact report subtype (Electrical,
// Plumbing, IT, Security-equipment) determines default SLA hours and icon.
// ReportFactory.create() is the factory method that picks the right subclass.

class Report {
  constructor({ id, title, description, location }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.location = location;
    this.slaHours = 48;
    this.icon = 'wrench';
  }
}

class ElectricalReport extends Report {
  constructor(props) { super(props); this.subCategory = 'Electrical'; this.slaHours = 24; this.icon = 'zap'; }
}
class PlumbingReport extends Report {
  constructor(props) { super(props); this.subCategory = 'Plumbing'; this.slaHours = 24; this.icon = 'droplet'; }
}
class ITReport extends Report {
  constructor(props) { super(props); this.subCategory = 'IT'; this.slaHours = 12; this.icon = 'cpu'; }
}
class SecurityReport extends Report {
  constructor(props) { super(props); this.subCategory = 'Security'; this.slaHours = 2; this.icon = 'shield'; }
}

class ReportFactory {
  static create(subCategory, props) {
    switch (subCategory) {
      case 'Electrical': return new ElectricalReport(props);
      case 'Plumbing': return new PlumbingReport(props);
      case 'IT': return new ITReport(props);
      case 'Security': return new SecurityReport(props);
      default: return new Report(props);
    }
  }
}

module.exports = { ReportFactory };
