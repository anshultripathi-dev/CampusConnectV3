// ---- ABSTRACT FACTORY PATTERN ----
// Each ticket category (Maintenance, Safety, LostFound) needs a matched
// family of collaborators: a form validator, a routing target, and a
// notification template. The abstract factory guarantees these three always
// come from the same consistent family instead of being mixed and matched.

class TicketFamilyFactory {
  createValidator() { throw new Error('createValidator() must be implemented'); }
  createRouter() { throw new Error('createRouter() must be implemented'); }
  createNotificationTemplate() { throw new Error('createNotificationTemplate() must be implemented'); }
}

class MaintenanceFamilyFactory extends TicketFamilyFactory {
  createValidator() {
    return {
      validate: (payload) => {
        if (!payload.location) return 'Location is required for maintenance issues';
        if (!payload.subCategory) return 'Sub-category (Electrical/Plumbing/HVAC) is required';
        return null;
      }
    };
  }
  createRouter() {
    return { department: 'Maintenance', defaultRole: 'Maintenance' };
  }
  createNotificationTemplate() {
    return { subject: 'Maintenance Ticket Update', tone: 'operational' };
  }
}

class SafetyFamilyFactory extends TicketFamilyFactory {
  createValidator() {
    return {
      validate: (payload) => {
        if (!payload.location) return 'Location is required for safety reports';
        if (!payload.severity) return 'Severity level is required for safety reports';
        return null;
      }
    };
  }
  createRouter() {
    return { department: 'Security', defaultRole: 'Security' };
  }
  createNotificationTemplate() {
    return { subject: 'URGENT: Safety Incident Update', tone: 'urgent' };
  }
}

class LostFoundFamilyFactory extends TicketFamilyFactory {
  createValidator() {
    return {
      validate: (payload) => {
        if (!payload.itemDescription) return 'Item description is required';
        return null;
      }
    };
  }
  createRouter() {
    return { department: 'Facilities', defaultRole: 'FacilitiesHead' };
  }
  createNotificationTemplate() {
    return { subject: 'Lost & Found Update', tone: 'neutral' };
  }
}

function getTicketFamilyFactory(category) {
  switch (category) {
    case 'Maintenance': return new MaintenanceFamilyFactory();
    case 'Safety': return new SafetyFamilyFactory();
    case 'LostFound': return new LostFoundFamilyFactory();
    default: throw new Error(`Unknown ticket category: ${category}`);
  }
}

module.exports = { getTicketFamilyFactory };
