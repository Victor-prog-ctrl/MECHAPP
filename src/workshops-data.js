(function () {
  const workshops = [
    {
      id: 'automaster-centro',
      name: 'AutoMasters · Centro',
      shortDescription: 'Especialistas en mantenimiento integral y diagnósticos electrónicos para flotas urbanas.',
      description:
        'AutoMasters · Centro combina tecnología de diagnóstico de última generación con un equipo certificado para resolver problemas mecánicos complejos y mantenimientos preventivos.',
      services: [
        'Mantenimiento general y preventivo',
        'Diagnóstico electrónico avanzado',
        'Reparación de frenos y suspensión',
        'Preparación para revisión técnica',
      ],
      experienceYears: 12,
      address: "Av. Libertador Bernardo O'Higgins 1234, Santiago",
      schedule: 'Lunes a sábado de 9:00 a 19:00 hrs',
      phone: '+56 2 2345 6789',
      email: 'contacto@automastercentro.cl',
      certifications: ['Bosch Service Partner', 'ISO 9001 Talleres'],
      photo: '../assets/mantenimiento-generalf-Photoroom.png',
      specialties: ['Mantenimiento general', 'Diagnóstico electrónico', 'Frenos'],
      rating: 4.9,
      reviewsCount: 128,
    },
    {
      id: 'taller-ruiz',
      name: 'Taller Ruiz',
      shortDescription: 'Alineación, balanceo y servicios de suspensión con equipamiento de precisión.',
      description:
        'Taller Ruiz es reconocido por su servicio ágil y por acompañar a conductores particulares y flotas en trabajos de suspensión, dirección y neumáticos.',
      services: [
        'Alineación y balanceo computarizado',
        'Reparación de suspensión y dirección',
        'Cambio y rotación de neumáticos',
        'Diagnóstico de vibraciones en carretera',
      ],
      experienceYears: 9,
      address: 'Av. Providencia 1456, Providencia',
      schedule: 'Lunes a viernes de 8:30 a 18:30 hrs',
      phone: '+56 2 2765 9012',
      email: 'contacto@tallerruiz.cl',
      certifications: ['Hunter Elite Alignment', 'Socio Red Neumáticos Chile'],
      photo: '../assets/aliniacion-Photoroom.png',
      specialties: ['Alineación', 'Suspensión', 'Neumáticos'],
      rating: 4.8,
      reviewsCount: 96,
    },
    {
      id: 'electroauto-norte',
      name: 'ElectroAuto Norte',
      shortDescription: 'Diagnóstico eléctrico, baterías inteligentes e inyección electrónica.',
      description:
        'ElectroAuto Norte atiende vehículos híbridos y convencionales con especialistas en electrónica automotriz, ofreciendo soluciones rápidas y garantizadas.',
      services: [
        'Diagnóstico eléctrico y electrónico',
        'Reparación de sistemas de carga e iluminación',
        'Mantención de baterías de litio e híbridas',
        'Programación de módulos y sensores',
      ],
      experienceYears: 11,
      address: 'Av. Recoleta 2888, Recoleta',
      schedule: 'Lunes a sábado de 9:30 a 18:30 hrs',
      phone: '+56 2 2890 1122',
      email: 'hola@electroautonorte.cl',
      certifications: ['Especialistas ASE Eléctrico', 'Autel Elite Workshop'],
      photo: '../assets/transparent-Photoroom.png',
      specialties: ['Diagnóstico eléctrico', 'Híbridos', 'Baterías'],
      rating: 4.7,
      reviewsCount: 104,
    },
    {
      id: 'torque-sur',
      name: 'Torque Sur',
      shortDescription: 'Servicios rápidos de frenos, cambios de aceite y asistencia en ruta.',
      description:
        'Torque Sur entrega soluciones exprés con repuestos certificados, asistencia a domicilio y seguimiento digital del historial del vehículo.',
      services: [
        'Cambio de aceite y filtros',
        'Servicio de frenos completos',
        'Atención en ruta dentro de la comuna',
        'Diagnóstico de motores gasolina y diésel',
      ],
      experienceYears: 7,
      address: 'Gran Avenida José Miguel Carrera 7200, San Miguel',
      schedule: 'Lunes a domingo de 10:00 a 19:30 hrs',
      phone: '+56 9 9988 7766',
      email: 'servicio@torquesur.cl',
      certifications: ['Mobil Service Center', 'Certificado SEC'],
      photo: '../assets/logo-oscuro.png',
      specialties: ['Frenos', 'Lubricación', 'Asistencia en ruta'],
      rating: 4.6,
      reviewsCount: 87,
    },
  ];

  const workshopMap = new Map(workshops.map((workshop) => [workshop.id, workshop]));

  function findWorkshopById(id) {
    if (!id) {
      return undefined;
    }
    return workshopMap.get(String(id));
  }

  function getWorkshopSummary() {
    return workshops.map((workshop) => ({
      id: workshop.id,
      name: workshop.name,
      shortDescription: workshop.shortDescription,
      specialties: workshop.specialties,
      rating: workshop.rating,
      reviewsCount: workshop.reviewsCount,
      photo: workshop.photo,
    }));
  }

  if (!window.Mechapp) {
    window.Mechapp = {};
  }

  window.Mechapp.workshops = {
    list: workshops,
    findById,
    getSummary: getWorkshopSummary,
  };

  function findById(id) {
    return findWorkshopById(id);
  }
})();
