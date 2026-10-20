// ---------- 1. QUEUE (linked list, FIFO) ----------
// Used for: each restaurant's pending orders. First order placed = first order served.
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class Queue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
  }
  enqueue(value) {            // add at the back  - O(1)
    const node = new Node(value);
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.size++;
  }
  dequeue() {                 // remove from the front - O(1)
    if (!this.head) return null;
    const value = this.head.value;
    this.head = this.head.next;
    if (!this.head) this.tail = null;
    this.size--;
    return value;
  }
  peek() {
    return this.head ? this.head.value : null;
  }
  toArray() {
    const out = [];
    for (let n = this.head; n; n = n.next) out.push(n.value);
    return out;
  }
}

// ---------- 2. GRAPH + DIJKSTRA ----------
// Used for: delivery tracking. Nodes = places, edges = roads with distance in km.
class Graph {
  constructor() {
    this.adj = new Map();     // HashMap: place -> [{ to, km }]
  }
  addRoad(a, b, km) {
    if (!this.adj.has(a)) this.adj.set(a, []);
    if (!this.adj.has(b)) this.adj.set(b, []);
    this.adj.get(a).push({ to: b, km });
    this.adj.get(b).push({ to: a, km });
  }
  has(place) {
    return this.adj.has(place);
  }
  places() {
    return [...this.adj.keys()];
  }
  // Shortest path by distance (Dijkstra)
  shortestPath(from, to) {
    if (!this.adj.has(from) || !this.adj.has(to)) return null;
    const dist = new Map();
    const prev = new Map();
    const done = new Set();
    for (const p of this.adj.keys()) dist.set(p, Infinity);
    dist.set(from, 0);

    while (done.size < this.adj.size) {
      let current = null;     // pick the nearest unvisited place
      for (const [p, d] of dist) {
        if (!done.has(p) && (current === null || d < dist.get(current))) current = p;
      }
      if (current === null || dist.get(current) === Infinity) break;
      done.add(current);
      if (current === to) break;
      for (const edge of this.adj.get(current)) {
        const nd = dist.get(current) + edge.km;
        if (nd < dist.get(edge.to)) {
          dist.set(edge.to, nd);
          prev.set(edge.to, current);
        }
      }
    }
    if (dist.get(to) === Infinity) return null;
    const path = [];
    for (let p = to; p !== undefined; p = prev.get(p)) path.unshift(p);
    return { path, km: dist.get(to) };
  }
}

// Sample city map (edit the names to match your area)
function buildCityMap() {
  const g = new Graph();
  g.addRoad("Kattankulathur", "Potheri", 2);
  g.addRoad("Potheri", "Guduvanchery", 4);
  g.addRoad("Guduvanchery", "Vandalur", 6);
  g.addRoad("Potheri", "Maraimalai Nagar", 5);
  g.addRoad("Maraimalai Nagar", "Singaperumal Koil", 6);
  g.addRoad("Kattankulathur", "Singaperumal Koil", 9);
  g.addRoad("Vandalur", "Tambaram", 7);
  g.addRoad("Guduvanchery", "Tambaram", 11);
  return g;
}

module.exports = { Queue, Graph, buildCityMap };