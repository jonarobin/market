const { createApp, ref, onMounted } = Vue;

let map;
const USE_FIREBASE = false;

// confi de firebase
const firebaseConfig = {
  apiKey: "AIzaSyAI2fw5PjOwsxMsFdMJysMA7QF_5KHYpDs",
  authDomain: "agenddo-production.firebaseapp.com",
  projectId: "agenddo-production",
  storageBucket: "agenddo-production.appspot.com",
  messagingSenderId: "132640743736",
  appId: "1:132640743736:web:7cf763db1201e9528d61cd",
  measurementId: "G-R50W4RT3VP",
};

const boundsBA = {
  north: -34.52656, // Límite norte
  south: -34.70549, // Límite sur
  west: -58.530003, // Límite oeste
  east: -58.335161 // Límite este
};


// Función para ver si una ubicación está dentro de los límites de Buenos Aires
function isInBuenosAires(lat, lng) {
  return (
    lat <= boundsBA.north &&
    lat >= boundsBA.south &&
    lng >= boundsBA.west &&
    lng <= boundsBA.east
  );
}

function getPopupTemplate(organization) {
  return `
    <div class="map-popup">
      <img src="https://i.imgur.com/bbaUCSq.jpg" />
      <p>${organization.name}</p>
      <p class="address">${organization.location}</p>
      <a href="https://app.binbi.com.ar/go/${organization.urlStore}" target="_blank">Ver tienda</a>
    </div>
  `
}

function createMap() {
  map = L.map("map").setView([-34.603722, -58.381592], 13);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      attribution: "© OpenStreetMap contributors"
    }
  ).addTo(map);
}

function geoJsonAdapter(feature) {
  const coordinates = feature.geometry.coordinates;
  return {
    location: [coordinates[1], coordinates[0]],
    name: feature.properties.Nombre,
    industries: feature.properties.Rubro,
    image: feature.properties.Foto,
    whatsapp: feature.properties.Link ? feature.properties.Link : '11111111'
  }
}

createApp({
  setup() {
    const isLoading = ref(true);
    const organizations = ref([]);
    const modalOpen = ref(false);
    const selectedOrg = ref({});
    const search = ref('');
    const mapMobile = ref(false);
    const industries = ref([
      "Ver todos",
      "Peluqueria",
      "SkinCare",
      "Uñas",
      "MakeUp",
      "Estética Corporal",
      "Barbería",
      "Cejas y Pestañas",
      "Depilación",
      "Medicina Estética",
      "Masajes",
      "Bronceado",
    ]);
    const industrySelected = ref('Ver todos');

    return {
      organizations,
      isLoading,
      modalOpen,
      selectedOrg,
      search,
      industries,
      industrySelected,
      mapMobile
    }
  },
  mounted() {
    // createMap();
    // arranca firebase
    if (USE_FIREBASE) {
      firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    db.collection("organizations")
      .orderBy("name", "asc")
      .get()
      .then((snapshot) => {
        const promises = snapshot.docs.map((doc) => {
          const card = doc.data();
          card.industries = card.industries || [];
          card.services = [];
          if (doc.data().services) {
            const servicePromises = doc.data().services.map((serviceId) =>
              db
                .collection("services")
                .doc(serviceId)
                .get()
                .then((serviceDoc) => {
                  if (serviceDoc.exists) {
                    const { name, price } = serviceDoc.data();
                    return { name, price: price.toString() || "N/A" }; // Convertir el precio a cadena
                  }
                  return null;
                })
            );
            return Promise.all(servicePromises).then((services) => {
              card.services = services.filter((service) => service !== null);
              return card;
            });
          } else {
            return Promise.resolve(card);
          }
        });
        return Promise.all(promises);
      })
      .then((organizationsResult) => {
        const organizationsWithService = organizationsResult.filter((org) => org.services.length);
        this.createMapMarkers(organizationsWithService);
        this.organizations = organizationsWithService;
        this.isLoading = false;
      })
      .catch((error) => {
        console.error("Error fetching documents:", error);
        this.isLoading = false;
      });
    } else {
      const geojsonUrl = "https://raw.githubusercontent.com/jonarobin/map/main/geojson/marquetpleis.geojson";
      fetch(geojsonUrl)
        .then(res => res.json())
        .then(data => {
          const organizationsWithService = data.features.map(geoJsonAdapter);
          this.createMapMarkers(organizationsWithService);
          this.organizations = organizationsWithService;
          this.isLoading = false;
        })
        .catch((error) => {
          console.error("Error fetching documents:", error);
          this.isLoading = false;
        });
    }
  },
  methods: {
    createMapMarkers: async function(organizations) {
      const self = this;
      const { Geocoder } = await google.maps.importLibrary('geocoding');
      const geocoder = new Geocoder();
      organizations.forEach((org, i) => {
        const orgLatlng = new google.maps.LatLng(...org.location);
        geocoder.geocode({ latLng: orgLatlng }, (results, status) => {
          if (status === 'OK') {
            const address = results[0].formatted_address;
            const lat = org.location[0];
            const lng = org.location[1];
            this.organizations[i].location = address;
            if (isInBuenosAires(lat, lng)) {
              const latLng = [lat, lng];
              // console.log(org.name, latLng);
              L.marker(latLng, {
                icon: L.divIcon({
                  className: 'custom-marker',
                  html: `<div class="marker-content"><img class="marker-image" src="${org.image ? org.image : 'https://i.imgur.com/bbaUCSq.jpg'}" alt="${org.name}" /></div>`,
                  iconSize: [25, 41],
                  iconAnchor: [12, 41],
                })
              })
                .addTo(map)
                .on('click', function () {
                  //getPopupTemplate(org)
                  self.openOrgModal(org);
                  // console.log(org);
                })
            } else {
              // console.log(`Ubicación fuera de Buenos Aires: ${location}`);
            }
          } else {
            console.log(
              `Geocodificación fallida para: ${location} con motivo: ${status}`
            );
          }
        })
      })
    },
    filterMarkers: async function(location) {
      if (location === 'No location' || (!this.filter && this.industrySelected === 'Ver todos')) {
        map.setView([-34.603722, -58.381592], 13);
        return;
      }
      const { Geocoder } = await google.maps.importLibrary('geocoding');
      const geocoder = new Geocoder();
      geocoder.geocode({ address: location }, (results, status) => {
        if (status === 'OK') {
          const coordinates = results[0].geometry.location;
            const lat = coordinates.lat();
            const lng = coordinates.lng();
            if (isInBuenosAires(lat, lng)) {
              const latLng = [lat, lng];
              map.setView(latLng, 25);
            }
        }
      });
    },
    openOrgModal: function (organization) {
      this.modalOpen = true;
      this.selectedOrg = organization;
    },
    closeModal: function () {
      this.modalOpen = false;
    },
    contactWsp: function(org) {
      window.open(
        `https://api.whatsapp.com/send?phone=${org.whatsapp}&text=%F0%9F%91%8B%20Hola%2C%20te%20encontr%C3%A9%20en%20%E2%9C%A8%20Agenddo.com%20y%20me%20encantar%C3%ADa%20saber%20mas%20sobre%20los%20servicios%20que%20ofrecen.%C2%A1Gracias!%20%F0%9F%98%8A`,
        '_blank'
      ).focus();
    },
    filter: function (organizations) {
      let result = [];

      if (organizations.length) {
        result = organizations.filter((org) => {
          let filterKey = this.search.toLowerCase();
          if (this.industrySelected === 'Ver todos' && !filterKey) {
            return org.name.toLowerCase().includes(filterKey) ||
              org.location.toLowerCase().includes(filterKey);
          } else if (this.industrySelected == 'Ver todos' && filterKey) {
            return org.name.toLowerCase().includes(filterKey) ||
              org.location.toLowerCase().includes(filterKey);
          } else if (this.industrySelected !== 'Ver todos' && !filterKey) {
            return org.industries.some((i) => i.includes(this.industrySelected));
          } else {
            return (org.name.toLowerCase().includes(filterKey) ||
              org.location.toLowerCase().includes(filterKey)) &&
              org.industries.some((i) => i.includes(this.industrySelected));
          }
        })
      }

      if (result.length !== organizations.length && result[0] && result[0].location) {
        this.filterMarkers(result[0].location);
      }
      this.filterMarkers('No location');
      return result;
    },
    setIndustry: function(industry) {
      this.industrySelected = industry;
    },
    toggleMapMobile: function() {
      this.mapMobile = !this.mapMobile;
      map.setView([-34.603722, -58.381592], 13);
    }
  }
}).mount('#app');

async function initMap() {
  map = L.map("map").setView([-34.603722, -58.381592], 13);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      attribution: "© OpenStreetMap contributors"
    }
  ).addTo(map)
}

initMap();