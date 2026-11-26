/** Dipakai hanya untuk membangun css/tailwind.css (lihat package.json: npm run build:css). */
module.exports = {
    content: ['./index.html', './js/**/*.js'],
    safelist: [{ pattern: /^(bg|text|border)-(slate|blue|indigo|emerald|amber|red|green|purple|rose|sky|teal|orange|yellow|cyan|pink|violet)-(50|100|200|300|400|500|600|700|800|900)$/ }],
    theme: { extend: {} },
    plugins: []
};
