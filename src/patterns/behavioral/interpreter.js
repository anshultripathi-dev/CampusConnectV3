// ---- INTERPRETER PATTERN ----
// Admins can define simple auto-routing rules as text, e.g.:
//   "IF category=Maintenance AND subCategory=Electrical THEN route=Maintenance-B"
// RuleInterpreter parses and evaluates these small expressions against a
// ticket without needing a database of hardcoded if/else branches.

class Condition {
  constructor(field, value) { this.field = field; this.value = value; }
  interpret(context) {
    return String(context[this.field] ?? '').toLowerCase() === this.value.toLowerCase();
  }
}

class AndExpression {
  constructor(conditions) { this.conditions = conditions; }
  interpret(context) {
    return this.conditions.every(c => c.interpret(context));
  }
}

class Rule {
  constructor(expression, routeTarget) {
    this.expression = expression;
    this.routeTarget = routeTarget;
  }
  evaluate(context) {
    return this.expression.interpret(context) ? this.routeTarget : null;
  }
}

// Parses one line like: "IF category=Maintenance AND subCategory=Electrical THEN route=Maintenance-B"
function parseRule(line) {
  const [conditionPart, thenPart] = line.split('THEN').map(s => s.trim());
  const conditionsRaw = conditionPart.replace(/^IF\s+/i, '').split('AND').map(s => s.trim());
  const conditions = conditionsRaw.map(cond => {
    const [field, value] = cond.split('=').map(s => s.trim());
    return new Condition(field, value);
  });
  const [, routeTarget] = thenPart.split('=').map(s => s.trim());
  return new Rule(new AndExpression(conditions), routeTarget);
}

class RuleInterpreter {
  constructor(ruleLines = []) {
    this.rules = ruleLines.map(parseRule);
  }
  addRule(line) {
    this.rules.push(parseRule(line));
  }
  route(ticketContext) {
    for (const rule of this.rules) {
      const target = rule.evaluate(ticketContext);
      if (target) return target;
    }
    return null; // fall back to default routing
  }
}

const DEFAULT_RULES = [
  'IF category=Maintenance AND subCategory=Electrical THEN route=Maintenance-Electrical-Team',
  'IF category=Maintenance AND subCategory=Plumbing THEN route=Maintenance-Plumbing-Team',
  'IF category=Safety AND severity=High THEN route=Security-Priority-Team',
  'IF category=LostFound THEN route=Facilities-Front-Desk',
];

module.exports = { RuleInterpreter, parseRule, DEFAULT_RULES };
