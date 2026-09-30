/**
 * 建築生成器設定參數 (對齊右側 Lil-GUI 精簡選單架構)
 */
export interface BuildingConfig {
  style: string;
  building: {
    width: number;
    depth: number;
    floors: number;
    groundFloorHeight: number;
    floorHeight: number;
    bayWidth: number;
    cornerMargin: number;
    wallThickness: number;
    seed: number;
    detailLevel: string;
  };
  facade: {
    grunge: number;
  };
  windows: {
    windowRatio: number;
    securityBars: boolean;
  };
  residents: {
    enableAC: boolean;
    enableClothes: boolean;
  };
  shops: {
    signboardLight: boolean;
    rollerDoorRatio: number;
  };
  rooftopSign: {
    enabled: boolean;
    color: string;
  };
  roof: {
    waterTank: boolean;
    antenna: boolean;
  };
  street: {
    enableSidewalk: boolean;
    enableTrees: boolean;
  };
  lighting: {
    mood: string;
    exposure: number;
    keyLightIntensity: number;
    fillLightIntensity: number;
    sunAzimuth: number;
    sunElevation: number;
  };
}

export const defaultConfig: BuildingConfig = {
  style: 'Chinese',
  building: {
    width: 18,
    depth: 13,
    floors: 6,
    groundFloorHeight: 4.2,
    floorHeight: 3.0,
    bayWidth: 3.3,
    cornerMargin: 1.0,
    wallThickness: 0.3,
    seed: 3,
    detailLevel: 'LOD0',
  },
  facade: {
    grunge: 0.4,
  },
  windows: {
    windowRatio: 0.75,
    securityBars: true,
  },
  residents: {
    enableAC: true,
    enableClothes: true,
  },
  shops: {
    signboardLight: true,
    rollerDoorRatio: 0.25,
  },
  rooftopSign: {
    enabled: true,
    color: '#ff3333',
  },
  roof: {
    waterTank: true,
    antenna: true,
  },
  street: {
    enableSidewalk: true,
    enableTrees: true,
  },
  lighting: {
    mood: 'Architectural',
    exposure: 0.92,
    keyLightIntensity: 2.2,
    fillLightIntensity: 0.8,
    sunAzimuth: 50,
    sunElevation: 45,
  }
};
