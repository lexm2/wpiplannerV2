const fs = require('fs');

// Load actual course data
const data = JSON.parse(fs.readFileSync('public/course-data-constructed.json', 'utf8'));
const maDept = data.departments.find(d => d.abbreviation === 'MA');

if (!maDept) {
    console.log('MA department not found!');
    process.exit(1);
}

// Find both courses
const ma2210 = maDept.courses.find(c => c.number === '2210');
const ma2201 = maDept.courses.find(c => c.number === '2201');

console.log('MA2210 found:', !!ma2210);
console.log('MA2201 found:', !!ma2201);
console.log('');

if (!ma2210 || !ma2201) {
    console.log('One or both courses not found!');
    process.exit(1);
}

// Simulate SearchTextFilter
const query = 'MA2210';
const queryLower = query.toLowerCase();

function fuzzyMatch(text, query) {
    if (text.includes(query)) {
        return true;
    }
    
    if (query.length <= 3) {
        return text.includes(query);
    }
    
    const words = query.split(/\s+/);
    return words.every(word => {
        if (word.length <= 2) return text.includes(word);
        
        const partial = word.substring(0, Math.floor(word.length * 0.8));
        return text.includes(partial);
    });
}

// Test MA2210
const courseCode2210 = ma2210.department.abbreviation + ma2210.number;
const courseText2210 = [
    ma2210.id,
    ma2210.name,
    ma2210.description,
    ma2210.department.name,
    courseCode2210
].join(' ').toLowerCase();

const passes2210 = courseText2210.includes(queryLower) || fuzzyMatch(courseText2210, queryLower);
console.log('MA2210:');
console.log('  courseText:', courseText2210.substring(0, 100) + '...');
console.log('  passes filter:', passes2210);

// Test MA2201
const courseCode2201 = ma2201.department.abbreviation + ma2201.number;
const courseText2201 = [
    ma2201.id,
    ma2201.name,
    ma2201.description,
    ma2201.department.name,
    courseCode2201
].join(' ').toLowerCase();

const passes2201 = courseText2201.includes(queryLower) || fuzzyMatch(courseText2201, queryLower);
console.log('');
console.log('MA2201:');
console.log('  courseText:', courseText2201.substring(0, 100) + '...');
console.log('  passes filter:', passes2201);

// Calculate scores
function calculateScore(course, query) {
    let score = 0;
    const normalizedQuery = query.replace(/[-\s]/g, '').toLowerCase();
    const courseCode = (course.department.abbreviation + course.number).toLowerCase().replace(/[-\s]/g, '');
    const normalizedId = course.id.toLowerCase().replace(/[-\s]/g, '');
    
    if (courseCode === normalizedQuery) score += 1000;
    if (normalizedId === normalizedQuery) score += 950;
    if (course.number.toLowerCase() === normalizedQuery) score += 900;
    if (courseCode.startsWith(normalizedQuery)) score += 750;
    if (normalizedId.startsWith(normalizedQuery)) score += 700;
    if (course.number.toLowerCase().startsWith(normalizedQuery)) score += 650;
    if (courseCode.includes(normalizedQuery)) score += 500;
    if (normalizedId.includes(normalizedQuery)) score += 450;
    
    return score;
}

console.log('');
console.log('Scores:');
const score2210 = calculateScore(ma2210, queryLower);
const score2201 = calculateScore(ma2201, queryLower);
console.log('  MA2210:', score2210);
console.log('  MA2201:', score2201);

console.log('');
console.log('Expected order: MA2210 first');
console.log('Actual order:', score2210 > score2201 ? 'MA2210 first ✓' : 'MA2201 first ✗');
