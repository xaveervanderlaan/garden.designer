Here are 12 design ideas for your garden, each in a different style. All coordinates are in metres on your plan.

```json
{
 "format": "garden-proposals/1",
 "proposals": [
  {
   "id": "p1",
   "title": "Natural meadow garden",
   "concept": "A relaxed garden with a lawn, a pond and loose planting for wildlife.",
   "tags": [
    "natural",
    "wildlife"
   ],
   "highlights": [
    "Pond for frogs and insects",
    "Native trees"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "lawn",
     "polygon": [
      [
       1,
       5
      ],
      [
       12,
       4
      ],
      [
       13,
       10
      ],
      [
       2,
       11
      ]
     ],
     "material": "meadow"
    },
    {
     "type": "object",
     "kind": "pond",
     "polygon": [
      [
       14,
       2
      ],
      [
       18,
       2.5
      ],
      [
       17.5,
       6
      ],
      [
       14.5,
       5.5
      ]
     ]
    },
    {
     "type": "object",
     "kind": "path",
     "polygon": [
      [
       1,
       12
      ],
      [
       19,
       12
      ],
      [
       19,
       13
      ],
      [
       1,
       13
      ]
     ],
     "material": "bark"
    },
    {
     "type": "plant",
     "plant": "betula-pendula",
     "at": [
      16,
      9
     ]
    },
    {
     "type": "group",
     "plant": "deschampsia-cespitosa",
     "at": [
      8,
      7
     ],
     "count": 12
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       3.5,
       2
      ],
      "w": 5,
      "d": 2
     },
     "mix": [
      {
       "plant": "geranium-rozanne",
       "share": 2
      },
      {
       "plant": "nepeta-faassenii",
       "share": 1
      }
     ]
    }
   ]
  },
  {
   "id": "p2",
   "title": "Cottage border garden",
   "concept": "Colourful mixed borders along a gravel path with a seating spot.",
   "tags": [
    "cottage",
    "colourful"
   ],
   "highlights": [
    "Long flowering borders",
    "Climbing roses on the fence"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "path",
     "polygon": [
      [
       0,
       7
      ],
      [
       20,
       7
      ],
      [
       20,
       8
      ],
      [
       0,
       8
      ]
     ],
     "material": "gravel"
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       10,
       3
      ],
      "w": 18,
      "d": 3
     },
     "mix": [
      {
       "plant": "echinacea-purpurea",
       "share": 1
      },
      {
       "plant": "salvia-nemorosa-caradonna",
       "share": 1
      },
      {
       "plant": "alchemilla-mollis",
       "share": 1
      }
     ]
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       10,
       12
      ],
      "w": 18,
      "d": 2.5
     },
     "mix": [
      {
       "plant": "geranium-rozanne",
       "share": 2
      },
      {
       "plant": "nepeta-faassenii",
       "share": 1
      }
     ]
    },
    {
     "type": "object",
     "kind": "furniture",
     "at": [
      17,
      10
     ],
     "variant": "bench"
    },
    {
     "type": "plant",
     "plant": "malus-evereste",
     "at": [
      3,
      10
     ]
    }
   ]
  },
  {
   "id": "p3",
   "title": "Modern terrace garden",
   "concept": "Clean lines with a large terrace, grasses and a clipped hedge.",
   "tags": [
    "modern",
    "low maintenance"
   ],
   "highlights": [
    "Large terrace",
    "Grass borders"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "terrace",
     "rect": {
      "c": [
       10,
       7.5
      ],
      "w": 8,
      "d": 5
     },
     "material": "concrete"
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       10,
       2
      ],
      "w": 14,
      "d": 2
     },
     "mix": [
      {
       "plant": "calamagrostis-acutiflora-karl-foerster",
       "share": 2
      },
      {
       "plant": "hakonechloa-macra",
       "share": 1
      }
     ]
    },
    {
     "type": "hedge",
     "line": [
      [
       1,
       13
      ],
      [
       19,
       13
      ]
     ],
     "plant": "taxus-baccata",
     "heightM": 1.2
    },
    {
     "type": "object",
     "kind": "lighting",
     "at": [
      4,
      8
     ]
    }
   ]
  },
  {
   "id": "p4",
   "title": "Mediterranean gravel garden",
   "concept": "Sunny gravel beds with lavender, herbs and a fig tree.",
   "tags": [
    "mediterranean",
    "drought tolerant"
   ],
   "highlights": [
    "Lavender and rosemary",
    "Gravel terrace"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "gravel",
     "rect": {
      "c": [
       10,
       7.5
      ],
      "w": 14,
      "d": 9
     }
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       5,
       4
      ],
      "w": 6,
      "d": 3
     },
     "mix": [
      {
       "plant": "lavandula-angustifolia",
       "share": 2
      },
      {
       "plant": "salvia-rosmarinus",
       "share": 1
      }
     ]
    },
    {
     "type": "object",
     "kind": "terrace",
     "rect": {
      "c": [
       14,
       9
      ],
      "w": 5,
      "d": 4
     },
     "material": "natural-stone"
    },
    {
     "type": "plant",
     "plant": "ficus-carica",
     "at": [
      3,
      11
     ]
    },
    {
     "type": "group",
     "plant": "thymus-vulgaris",
     "at": [
      9,
      10
     ],
     "count": 8
    }
   ]
  },
  {
   "id": "p5",
   "title": "Japanese-inspired garden",
   "concept": "A calm garden with a pond, maples, moss-like ground cover and a stone path.",
   "tags": [
    "japanese",
    "calm"
   ],
   "highlights": [
    "Acer palmatum",
    "Stepping path"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "pond",
     "polygon": [
      [
       8,
       5
      ],
      [
       13,
       5
      ],
      [
       14,
       8
      ],
      [
       10,
       10
      ],
      [
       7,
       8
      ]
     ]
    },
    {
     "type": "plant",
     "plant": "acer-palmatum",
     "at": [
      6,
      4
     ]
    },
    {
     "type": "plant",
     "plant": "acer-palmatum",
     "at": [
      15,
      11
     ]
    },
    {
     "type": "object",
     "kind": "path",
     "polygon": [
      [
       1,
       13
      ],
      [
       10,
       12
      ],
      [
       10,
       14
      ],
      [
       1,
       14
      ]
     ],
     "material": "natural-stone"
    },
    {
     "type": "group",
     "plant": "hakonechloa-macra",
     "at": [
      12,
      4
     ],
     "count": 10
    },
    {
     "type": "object",
     "kind": "wall",
     "line": [
      [
       0,
       0.5
      ],
      [
       20,
       0.5
      ]
     ],
     "thicknessM": 0.3
    }
   ]
  },
  {
   "id": "p6",
   "title": "Edible garden",
   "concept": "Vegetable beds, raised beds and fruit trees for a family.",
   "tags": [
    "edible",
    "family"
   ],
   "highlights": [
    "Four vegetable beds",
    "Fruit trees"
   ],
   "elements": [
    {
     "type": "bed",
     "kind": "bed-vegetable",
     "rect": {
      "c": [
       5,
       4
      ],
      "w": 4,
      "d": 1.2
     },
     "crops": [
      {
       "plant": "lactuca-sativa"
      },
      {
       "plant": "raphanus-sativus"
      }
     ]
    },
    {
     "type": "bed",
     "kind": "bed-vegetable",
     "rect": {
      "c": [
       5,
       7
      ],
      "w": 4,
      "d": 1.2
     },
     "crops": [
      {
       "plant": "solanum-lycopersicum"
      },
      {
       "plant": "daucus-carota-subsp-sativus"
      }
     ],
     "rowAngleDeg": 90
    },
    {
     "type": "bed",
     "kind": "raised-bed",
     "rect": {
      "c": [
       14,
       4
      ],
      "w": 2.4,
      "d": 1.2
     },
     "crops": [
      {
       "plant": "allium-porrum"
      }
     ]
    },
    {
     "type": "plant",
     "plant": "malus-domestica",
     "at": [
      17,
      10
     ]
    },
    {
     "type": "plant",
     "plant": "pyrus-communis",
     "at": [
      3,
      11
     ]
    },
    {
     "type": "group",
     "plant": "rubus-idaeus",
     "at": [
      12,
      12
     ],
     "count": 6
    },
    {
     "type": "object",
     "kind": "compost",
     "at": [
      19,
      13
     ]
    }
   ]
  },
  {
   "id": "p7",
   "title": "Formal symmetrical garden",
   "concept": "Symmetrical box-edged beds around a central lawn.",
   "tags": [
    "formal",
    "symmetrical"
   ],
   "highlights": [
    "Box hedges",
    "Central lawn"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "lawn",
     "rect": {
      "c": [
       10,
       7.5
      ],
      "w": 8,
      "d": 6
     }
    },
    {
     "type": "hedge",
     "line": [
      [
       5,
       3
      ],
      [
       15,
       3
      ]
     ],
     "plant": "buxus-sempervirens"
    },
    {
     "type": "hedge",
     "line": [
      [
       5,
       12
      ],
      [
       15,
       12
      ]
     ],
     "plant": "buxus-sempervirens"
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       3,
       7.5
      ],
      "w": 2,
      "d": 8
     },
     "mix": [
      {
       "plant": "geranium-rozanne",
       "share": 2
      },
      {
       "plant": "nepeta-faassenii",
       "share": 1
      }
     ]
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       17,
       7.5
      ],
      "w": 2,
      "d": 8
     },
     "mix": [
      {
       "plant": "geranium-rozanne",
       "share": 2
      },
      {
       "plant": "nepeta-faassenii",
       "share": 1
      }
     ]
    },
    {
     "type": "plant",
     "plant": "taxus-baccata",
     "at": [
      10,
      1.5
     ]
    }
   ]
  },
  {
   "id": "p8",
   "title": "Family play garden",
   "concept": "Lawn, a play area and robust planting along the borders.",
   "tags": [
    "family",
    "play"
   ],
   "highlights": [
    "Trampoline",
    "Sandbox"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "lawn",
     "rect": {
      "c": [
       10,
       7.5
      ],
      "w": 14,
      "d": 9
     }
    },
    {
     "type": "object",
     "kind": "play",
     "at": [
      6,
      8
     ],
     "variant": "trampoline"
    },
    {
     "type": "object",
     "kind": "play",
     "at": [
      14,
      5
     ],
     "variant": "sandbox"
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       10,
       13
      ],
      "w": 16,
      "d": 2
     },
     "mix": [
      {
       "plant": "geranium-rozanne",
       "share": 2
      },
      {
       "plant": "nepeta-faassenii",
       "share": 1
      }
     ]
    },
    {
     "type": "object",
     "kind": "fence",
     "line": [
      [
       0,
       0.5
      ],
      [
       20,
       0.5
      ]
     ],
     "thicknessM": 0.08,
     "heightM": 1.2
    }
   ]
  },
  {
   "id": "p9",
   "title": "Shady woodland garden",
   "concept": "Ferns and shade perennials under trees.",
   "tags": [
    "shade",
    "woodland"
   ],
   "highlights": [
    "Ferns",
    "Native trees"
   ],
   "elements": [
    {
     "type": "plant",
     "plant": "carpinus-betulus-fastigiata",
     "at": [
      4,
      5
     ]
    },
    {
     "type": "plant",
     "plant": "amelanchier-lamarckii",
     "at": [
      15,
      4
     ]
    },
    {
     "type": "group",
     "plant": "dryopteris-filix-mas",
     "at": [
      9,
      6
     ],
     "count": 9
    },
    {
     "type": "group",
     "plant": "helleborus-hybridus",
     "at": [
      12,
      10
     ],
     "count": 7
    },
    {
     "type": "object",
     "kind": "path",
     "polygon": [
      [
       2,
       10
      ],
      [
       18,
       9
      ],
      [
       18,
       10.5
      ],
      [
       2,
       11.5
      ]
     ],
     "material": "bark"
    }
   ]
  },
  {
   "id": "p10",
   "title": "Wildlife hedge garden",
   "concept": "Mixed native hedges, a pond and a wild corner for birds.",
   "tags": [
    "wildlife",
    "native"
   ],
   "highlights": [
    "Native hedge",
    "Pond"
   ],
   "elements": [
    {
     "type": "hedge",
     "line": [
      [
       0.5,
       1
      ],
      [
       19.5,
       1
      ]
     ],
     "plant": "crataegus-monogyna"
    },
    {
     "type": "hedge",
     "line": [
      [
       19.5,
       1
      ],
      [
       19.5,
       14
      ]
     ],
     "plant": "prunus-spinosa"
    },
    {
     "type": "object",
     "kind": "pond",
     "polygon": [
      [
       4,
       8
      ],
      [
       8,
       7
      ],
      [
       9,
       10
      ],
      [
       5,
       11
      ]
     ]
    },
    {
     "type": "plant",
     "plant": "sorbus-aucuparia",
     "at": [
      13,
      8
     ]
    },
    {
     "type": "group",
     "plant": "eupatorium-cannabinum",
     "at": [
      14,
      12
     ],
     "count": 8
    },
    {
     "type": "remove",
     "ref": "E3"
    }
   ]
  },
  {
   "id": "p11",
   "title": "Productive garden with greenhouse",
   "concept": "A greenhouse, shed and vegetable beds with a compost corner.",
   "tags": [
    "edible",
    "productive"
   ],
   "highlights": [
    "Greenhouse",
    "Shed"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "greenhouse",
     "rect": {
      "c": [
       16,
       3
      ],
      "w": 3,
      "d": 2.5
     }
    },
    {
     "type": "object",
     "kind": "shed",
     "rect": {
      "c": [
       17,
       12
      ],
      "w": 3,
      "d": 2.5,
      "rot": 10
     }
    },
    {
     "type": "bed",
     "kind": "bed-vegetable",
     "rect": {
      "c": [
       6,
       4
      ],
      "w": 4,
      "d": 1.2
     },
     "crops": [
      {
       "plant": "cucurbita-pepo"
      },
      {
       "plant": "phaseolus-vulgaris"
      }
     ]
    },
    {
     "type": "bed",
     "kind": "bed-vegetable",
     "rect": {
      "c": [
       6,
       8
      ],
      "w": 4,
      "d": 1.2
     },
     "crops": [
      {
       "plant": "beta-vulgaris"
      },
      {
       "plant": "spinacia-oleracea"
      }
     ]
    },
    {
     "type": "object",
     "kind": "rain-barrel",
     "at": [
      19,
      8
     ]
    },
    {
     "type": "remove",
     "ref": "P1"
    }
   ]
  },
  {
   "id": "p12",
   "title": "Pergola dining garden",
   "concept": "A pergola terrace with climbers and herbs around it.",
   "tags": [
    "entertaining",
    "herbs"
   ],
   "highlights": [
    "Pergola",
    "Herb bed"
   ],
   "elements": [
    {
     "type": "object",
     "kind": "pergola",
     "rect": {
      "c": [
       10,
       6
      ],
      "w": 4,
      "d": 4
     }
    },
    {
     "type": "object",
     "kind": "terrace",
     "rect": {
      "c": [
       10,
       6
      ],
      "w": 5,
      "d": 5
     },
     "material": "wood"
    },
    {
     "type": "object",
     "kind": "furniture",
     "at": [
      10,
      6
     ],
     "variant": "dining-set"
    },
    {
     "type": "bed",
     "kind": "bed-ornamental",
     "rect": {
      "c": [
       4,
       11
      ],
      "w": 6,
      "d": 2
     },
     "mix": [
      {
       "plant": "salvia-rosmarinus",
       "share": 1
      },
      {
       "plant": "origanum-vulgare",
       "share": 1
      },
      {
       "plant": "thymus-vulgaris",
       "share": 1
      }
     ]
    },
    {
     "type": "plant",
     "plant": "wisteria-sinensis",
     "at": [
      8,
      4
     ]
    }
   ]
  }
 ]
}
```

Tell me which ones you would like to see refined.
