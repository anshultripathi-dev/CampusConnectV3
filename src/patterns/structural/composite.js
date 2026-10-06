// ---- COMPOSITE PATTERN ----
// Campus -> Buildings -> Floors -> Rooms forms a tree. CampusNode is the
// common interface so code can treat a single Room and an entire Building
// the same way when counting open tickets or listing all rooms.

class CampusNode {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  add(child) {
    this.children.push(child);
    return this;
  }
  // Recursively collects every leaf Room beneath this node.
  listRooms() {
    if (this.children.length === 0) return [this.name]; // leaf = room
    return this.children.flatMap(c => c.listRooms());
  }
  countRooms() {
    return this.listRooms().length;
  }
}

function buildCampusTree(campusData) {
  const campusNode = new CampusNode(campusData.name);
  for (const building of campusData.buildings) {
    const buildingNode = new CampusNode(building.name);
    for (const floor of building.floors) {
      const floorNode = new CampusNode(floor.name);
      for (const room of floor.rooms) {
        floorNode.add(new CampusNode(room)); // leaf node
      }
      buildingNode.add(floorNode);
    }
    campusNode.add(buildingNode);
  }
  return campusNode;
}

module.exports = { CampusNode, buildCampusTree };
