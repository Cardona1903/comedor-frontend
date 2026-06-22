# Sistema de Comedores Universitarios Inteligente
Universidad de Caldas — Proyecto Final BD No Relacionales 2026-1
Carlos Daniel Cardona Acosta · Juan Manuel Aguirre Álzate
Docente: Oscar Bedoya

## Requisitos
- Node.js 18+
- MongoDB corriendo en localhost:27017
- Base de datos: comedorUCaldas

## Iniciar el sistema
npm install
node server.js

## Abrir el dashboard
http://localhost:3000

## Endpoints disponibles
GET  /api/stats
GET  /api/menus
GET  /api/estudiantes?sede=<nombre>
POST /api/reservas
GET  /api/reportes/desperdicio-dieta
GET  /api/reportes/asistencia-sede
GET  /api/reportes/promedio-diario-sede
GET  /api/reportes/proyeccion-demanda
GET  /api/reportes/financiero
GET  /api/reportes/estudiantes-riesgo
GET  /api/reportes/eficiencia-menus
