/**
 * ============================================================
 *  SISTEMA DE COMEDORES UNIVERSITARIOS INTELIGENTE
 *  Universidad de Caldas — Proyecto Final BD No Relacionales
 *  Backend: Express.js + MongoDB Driver
 * ============================================================
 *  Carlos Daniel Cardona Acosta
 *  Juan Manuel Aguirre Álzate
 *  Docente: Oscar Bedoya
 * ============================================================
 */

const express = require('express');
const cors    = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app  = express();
const PORT = 3000;

// ── Conexión a MongoDB local ──────────────────────────────────
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME   = 'comedorUCaldas';
let db;

async function conectar() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`✅ Conectado a MongoDB: ${DB_NAME}`);
}

// ── Middlewares ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static('public'));   // sirve el frontend desde /public

// ── Middleware de chequeo de conexión ─────────────────────────
app.use((req, res, next) => {
  if (!db) return res.status(503).json({ error: 'Base de datos no conectada' });
  next();
});

// ─────────────────────────────────────────────────────────────
//  ESTADÍSTICAS GENERALES  (tarjetas del dashboard)
// ─────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [estudiantes, reservas, menus, asistencia, preferencias] = await Promise.all([
      db.collection('estudiantes').countDocuments(),
      db.collection('reservas_comida').countDocuments(),
      db.collection('menus').countDocuments(),
      db.collection('registros_asistencia_comedor').countDocuments(),
      db.collection('preferencias_alimenticias').countDocuments()
    ]);
    res.json({
      estudiantes,
      reservas_comida: reservas,
      menus,
      registros_asistencia: asistencia,
      preferencias_alimenticias: preferencias,
      total: estudiantes + reservas + menus + asistencia + preferencias
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q3.2 — Ver los últimos 10 menús registrados
// ─────────────────────────────────────────────────────────────
app.get('/api/menus', async (req, res) => {
  try {
    const menus = await db.collection('menus')
      .find({})
      .project({ fecha: 1, sede: 1, proteina: 1, tipo_dieta: 1,
                 calorias: 1, costo_unitario: 1, desperdicio_kg: 1, _id: 0 })
      .sort({ fecha: -1 })
      .limit(10)
      .toArray();
    res.json(menus);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q3.5 — Estudiantes activos por sede
// ─────────────────────────────────────────────────────────────
app.get('/api/estudiantes', async (req, res) => {
  try {
    const { sede } = req.query;
    const filtro = { activo: true };
    if (sede) filtro.sede = sede;
    const est = await db.collection('estudiantes')
      .find(filtro)
      .project({ codigo: 1, nombre: 1, apellido: 1, sede: 1, semestre: 1, _id: 0 })
      .sort({ apellido: 1 })
      .limit(20)
      .toArray();
    res.json(est);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q3.1 — Registrar nueva reserva (CREATE)
// ─────────────────────────────────────────────────────────────
app.post('/api/reservas', async (req, res) => {
  try {
    const { codigo_estudiante, sede, fecha_almuerzo, hora_preferida } = req.body;
    if (!codigo_estudiante || !sede || !fecha_almuerzo) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: codigo_estudiante, sede, fecha_almuerzo' });
    }
    // Buscar el _id del estudiante por código
    const estudiante = await db.collection('estudiantes').findOne({ codigo: codigo_estudiante });
    if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' });

    const nuevaReserva = {
      estudiante_id: estudiante._id,
      fecha_reserva: new Date(),
      fecha_almuerzo: new Date(fecha_almuerzo),
      sede,
      estado: 'confirmada',
      hora_preferida: hora_preferida || '12:00',
      created_at: new Date()
    };
    const result = await db.collection('reservas_comida').insertOne(nuevaReserva);
    res.status(201).json({
      mensaje: '✅ Reserva creada exitosamente',
      id: result.insertedId,
      reserva: nuevaReserva
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q3.3 — Marcar reserva como "asistió" (UPDATE)
// ─────────────────────────────────────────────────────────────
app.patch('/api/reservas/:id/asistio', async (req, res) => {
  try {
    const result = await db.collection('reservas_comida').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { estado: 'asistió', hora_confirmacion: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ mensaje: '✅ Reserva marcada como asistió', modificados: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q3.4 — Eliminar reservas canceladas de +30 días (DELETE)
// ─────────────────────────────────────────────────────────────
app.delete('/api/reservas/canceladas', async (req, res) => {
  try {
    const fecha30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db.collection('reservas_comida').deleteMany({
      estado: 'cancelada',
      fecha_reserva: { $lt: fecha30dias }
    });
    res.json({ mensaje: `🗑️ Eliminadas ${result.deletedCount} reservas canceladas de más de 30 días` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q2.1 — % Desperdicio por tipo de dieta
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/desperdicio-dieta', async (req, res) => {
  try {
    const resultado = await db.collection('menus').aggregate([
      { $unwind: '$tipo_dieta' },
      {
        $group: {
          _id: '$tipo_dieta',
          total_preparadas: { $sum: '$porciones_preparadas' },
          total_servidas:   { $sum: '$porciones_servidas' },
          total_desperdicio_kg: { $sum: '$desperdicio_kg' }
        }
      },
      {
        $project: {
          tipo_dieta: '$_id', _id: 0,
          total_preparadas: 1,
          total_servidas: 1,
          total_desperdicio_kg: 1,
          porcentaje_desperdicio: {
            $round: [{
              $multiply: [
                { $divide: [
                  { $subtract: ['$total_preparadas', '$total_servidas'] },
                  '$total_preparadas'
                ]},
                100
              ]
            }, 2]
          }
        }
      },
      { $sort: { porcentaje_desperdicio: -1 } }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q2.2 — Tasa de asistencia por sede
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/asistencia-sede', async (req, res) => {
  try {
    const resultado = await db.collection('reservas_comida').aggregate([
      {
        $group: {
          _id: '$sede',
          total_reservas: { $sum: 1 },
          total_asistio: {
            $sum: { $cond: [{ $eq: ['$estado', 'asistió'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          sede: '$_id', _id: 0,
          total_reservas: 1,
          total_asistio: 1,
          tasa_asistencia_pct: {
            $round: [{
              $multiply: [{ $divide: ['$total_asistio', '$total_reservas'] }, 100]
            }, 1]
          }
        }
      },
      { $sort: { tasa_asistencia_pct: -1 } }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q2.3 — Top 5 estudiantes con más inasistencias
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/top-inasistencias', async (req, res) => {
  try {
    const resultado = await db.collection('registros_asistencia_comedor').aggregate([
      { $match: { asistio: false, motivo_inasistencia: null } },
      { $group: { _id: '$estudiante_id', total_inasistencias: { $sum: 1 } } },
      { $sort: { total_inasistencias: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'estudiantes',
          localField: '_id',
          foreignField: '_id',
          as: 'info_estudiante'
        }
      },
      { $unwind: { path: '$info_estudiante', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          codigo: { $ifNull: ['$info_estudiante.codigo', 'N/A'] },
          nombre: { $ifNull: ['$info_estudiante.nombre', 'Sin nombre'] },
          apellido: { $ifNull: ['$info_estudiante.apellido', ''] },
          sede: { $ifNull: ['$info_estudiante.sede', 'N/A'] },
          total_inasistencias: 1
        }
      }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q2.4 — Promedio de asistencia diaria por sede
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/promedio-diario-sede', async (req, res) => {
  try {
    const resultado = await db.collection('registros_asistencia_comedor').aggregate([
      { $match: { asistio: true } },
      {
        $group: {
          _id: {
            sede: '$sede',
            dia: { $dateToString: { format: '%Y-%m-%d', date: '$fecha' } }
          },
          asistentes_dia: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.sede',
          promedio_diario: { $avg: '$asistentes_dia' },
          dias_con_registro: { $sum: 1 }
        }
      },
      {
        $project: {
          sede: '$_id', _id: 0,
          promedio_diario: { $round: ['$promedio_diario', 1] },
          dias_con_registro: 1
        }
      },
      { $sort: { promedio_diario: -1 } }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q1.1 — Proyección de demanda semanal por sede
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/proyeccion-demanda', async (req, res) => {
  try {
    const resultado = await db.collection('registros_asistencia_comedor').aggregate([
      { $match: { asistio: true } },
      {
        $group: {
          _id: {
            sede: '$sede',
            dia_semana: { $dayOfWeek: '$fecha' },
            semana: { $week: '$fecha' }
          },
          asistentes: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: { sede: '$_id.sede', dia_semana: '$_id.dia_semana' },
          promedio_historico: { $avg: '$asistentes' },
          desviacion: { $stdDevPop: '$asistentes' }
        }
      },
      {
        $project: {
          _id: 0,
          sede: '$_id.sede',
          dia_semana: '$_id.dia_semana',
          promedio_historico: { $round: ['$promedio_historico', 0] },
          proyeccion_recomendada: {
            $round: [{ $multiply: ['$promedio_historico', 1.08] }, 0]
          },
          confiabilidad: {
            $cond: [
              { $lt: ['$desviacion', 8] }, 'Alta',
              { $cond: [{ $lt: ['$desviacion', 15] }, 'Media', 'Baja'] }
            ]
          }
        }
      },
      { $sort: { sede: 1, dia_semana: 1 } }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q1.2 — Reporte financiero por sede
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/financiero', async (req, res) => {
  try {
    const resultado = await db.collection('menus').aggregate([
      {
        $group: {
          _id: '$sede',
          total_preparadas: { $sum: '$porciones_preparadas' },
          total_servidas:   { $sum: '$porciones_servidas' },
          costo_total_producido: {
            $sum: { $multiply: ['$porciones_preparadas', '$costo_unitario'] }
          },
          costo_total_servido: {
            $sum: { $multiply: ['$porciones_servidas', '$costo_unitario'] }
          }
        }
      },
      {
        $project: {
          sede: '$_id', _id: 0,
          costo_total_producido: 1,
          costo_desperdicio_cop: { $subtract: ['$costo_total_producido', '$costo_total_servido'] },
          porcentaje_eficiencia: {
            $round: [{
              $multiply: [{ $divide: ['$total_servidas', '$total_preparadas'] }, 100]
            }, 1]
          },
          ahorro_proyectado_30pct: {
            $round: [{
              $multiply: [
                { $subtract: ['$costo_total_producido', '$costo_total_servido'] },
                0.30
              ]
            }, 0]
          }
        }
      },
      { $sort: { costo_desperdicio_cop: -1 } }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q1.3 — Estudiantes en riesgo de perder el beneficio
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/estudiantes-riesgo', async (req, res) => {
  try {
    const resultado = await db.collection('reservas_comida').aggregate([
      {
        $group: {
          _id: '$estudiante_id',
          total_reservas: { $sum: 1 },
          no_asistio: {
            $sum: { $cond: [{ $eq: ['$estado', 'no_asistió'] }, 1, 0] }
          }
        }
      },
      { $match: { total_reservas: { $gte: 1 } } },
      {
        $project: {
          estudiante_id: '$_id', _id: 0,
          total_reservas: 1, no_asistio: 1,
          tasa_inasistencia: {
            $round: [{
              $multiply: [{ $divide: ['$no_asistio', '$total_reservas'] }, 100]
            }, 1]
          }
        }
      },
      { $match: { tasa_inasistencia: { $gt: 20 } } },
      {
        $addFields: {
          estudiante_id_obj: { $toObjectId: '$estudiante_id' }
        }
      },
      {
        $lookup: {
          from: 'estudiantes',
          localField: 'estudiante_id_obj',
          foreignField: '_id',
          as: 'info'
        }
      },
      { $unwind: { path: '$info', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          codigo: { $ifNull: ['$info.codigo', 'N/A'] },
          nombre: { $ifNull: ['$info.nombre', 'Desconocido'] },
          apellido: { $ifNull: ['$info.apellido', ''] },
          sede: { $ifNull: ['$info.sede', 'N/A'] },
          tasa_inasistencia: 1,
          riesgo: { $literal: '⚠️ Beneficio en riesgo' }
        }
      },
      { $sort: { tasa_inasistencia: -1 } }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Q1.5 — Eficiencia de menús con recomendación
// ─────────────────────────────────────────────────────────────
app.get('/api/reportes/eficiencia-menus', async (req, res) => {
  try {
    const resultado = await db.collection('menus').aggregate([
      {
        $addFields: {
          eficiencia_pct: {
            $cond: [
              { $gt: ['$porciones_preparadas', 0] },
              {
                $round: [{
                  $multiply: [{ $divide: ['$porciones_servidas', '$porciones_preparadas'] }, 100]
                }, 1]
              },
              0
            ]
          }
        }
      },
      {
        $addFields: {
          recomendacion: {
            $switch: {
              branches: [
                { case: { $gte: ['$eficiencia_pct', 90] }, then: 'Mantener — alta demanda' },
                { case: { $gte: ['$eficiencia_pct', 75] }, then: 'Mantener — ajustar levemente' },
                { case: { $gte: ['$eficiencia_pct', 60] }, then: 'Reducir producción 15%' }
              ],
              default: 'Reevaluar o eliminar del ciclo'
            }
          }
        }
      },
      {
        $project: {
          _id: 0, fecha: 1, sede: 1, proteina: 1,
          porciones_preparadas: 1, porciones_servidas: 1,
          eficiencia_pct: 1, recomendacion: 1
        }
      },
      { $sort: { eficiencia_pct: 1 } },
      { $limit: 20 }
    ]).toArray();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  INICIO DEL SERVIDOR
// ─────────────────────────────────────────────────────────────
conectar()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🍽️  API Comedores UCaldas corriendo en http://localhost:${PORT}`);
      console.log(`📊 Dashboard disponible en  http://localhost:${PORT}`);
      console.log(`\nEndpoints disponibles:`);
      console.log(`  GET  /api/stats`);
      console.log(`  GET  /api/menus`);
      console.log(`  GET  /api/estudiantes?sede=<nombre>`);
      console.log(`  POST /api/reservas`);
      console.log(`  GET  /api/reportes/desperdicio-dieta`);
      console.log(`  GET  /api/reportes/asistencia-sede`);
      console.log(`  GET  /api/reportes/promedio-diario-sede`);
      console.log(`  GET  /api/reportes/proyeccion-demanda`);
      console.log(`  GET  /api/reportes/financiero`);
      console.log(`  GET  /api/reportes/estudiantes-riesgo`);
      console.log(`  GET  /api/reportes/eficiencia-menus`);
    });
  })
  .catch(err => {
    console.error('❌ Error al conectar con MongoDB:', err.message);
    process.exit(1);
  });
