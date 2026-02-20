// Simple test to verify our validation patterns work
console.log('Testing validation patterns...');

// Test cases
const testCases = [
  { name: 'null', value: null, expected: false },
  { name: 'undefined', value: undefined, expected: false },
  { name: 'empty array', value: [], expected: false },
  { name: 'array with null', value: [null], expected: false },
  { name: 'valid array', value: [{ id: 1 }], expected: true }
];

testCases.forEach(test => {
  const result = test.value && test.value.length > 0 && test.value[0];
  const passed = result === test.expected;
  console.log(`${test.name}: ${passed ? 'PASS' : 'FAIL'} (expected ${test.expected}, got ${result})`);
});

console.log('Validation tests completed.');
