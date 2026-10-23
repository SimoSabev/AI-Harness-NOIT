const items = [{ name: "Book", cents: 2500 }, { name: "Pen", cents: 300 }];
const total = items.reduce((s, i) => s + i.cents, 0);
document.getElementById("total").textContent = `Total: ${(total / 100).toFixed(2)}`;
