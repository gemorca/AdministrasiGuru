/**
 * Validator JSON Schema (subset yang dipakai Gemini structured output). Murni, dapat diuji di Node.
 * Mendukung: type (termasuk array tipe), enum, required, properties, additionalProperties:false,
 * items, minItems, maxItems, minimum, maximum, minLength, anyOf.
 * validate(schema, value) -> array pesan galat (kosong = valid).
 */
const Schema = (() => {
    function typeOf(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return 'array';
        if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
        return typeof v; // string, boolean, object
    }
    function typeOk(t, v) {
        const a = typeOf(v);
        if (t === 'number') return a === 'number' || a === 'integer';
        return t === a;
    }
    function validate(schema, value, path) {
        path = path || '$';
        const errs = [];
        if (!schema || typeof schema !== 'object') return errs;

        if (schema.anyOf) {
            const sub = schema.anyOf.map(s => validate(s, value, path));
            if (!sub.some(e => e.length === 0)) errs.push(`${path}: tidak cocok dengan salah satu bentuk yang diizinkan`);
            return errs;
        }
        if (schema.type) {
            const ts = Array.isArray(schema.type) ? schema.type : [schema.type];
            if (!ts.some(t => typeOk(t, value))) {
                errs.push(`${path}: tipe harus ${ts.join('/')} (didapat ${typeOf(value)})`);
                return errs;
            }
        }
        if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: harus salah satu dari ${schema.enum.join(', ')}`);
        if (typeof value === 'number') {
            if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: minimal ${schema.minimum}`);
            if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: maksimal ${schema.maximum}`);
        }
        if (typeof value === 'string' && schema.minLength !== undefined && value.trim().length < schema.minLength) {
            errs.push(`${path}: terlalu pendek (minimal ${schema.minLength} karakter)`);
        }
        if (Array.isArray(value)) {
            if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path}: minimal ${schema.minItems} item (ada ${value.length})`);
            if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path}: maksimal ${schema.maxItems} item (ada ${value.length})`);
            if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const props = schema.properties || {};
            for (const r of (schema.required || [])) if (!(r in value) || value[r] === undefined) errs.push(`${path}.${r}: wajib ada`);
            for (const [k, s] of Object.entries(props)) if (k in value) errs.push(...validate(s, value[k], `${path}.${k}`));
            if (schema.additionalProperties === false) {
                for (const k of Object.keys(value)) if (!(k in props)) errs.push(`${path}.${k}: properti tidak dikenal`);
            }
        }
        return errs;
    }
    return { validate, typeOf };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schema;
