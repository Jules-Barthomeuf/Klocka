import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AccueilVision from "@/components/vision/AccueilVision";
import ResultatsVision from "@/components/vision/ResultatsVision";

// Vision : la projection d'une stratégie d'acquisition de murs commerciaux
// sur trente ans. Quatre questions (AccueilVision), puis six vues d'un même
// calcul (ResultatsVision). Ce fichier ne garde que les données de référence,
// l'état et le calcul.


// Données des stratégies
const strategiesData = {
  "200": {
    patrimoniale: {
      cashflow: [-1186, -2146, -2901, -2652, -2397, -2137, -1872, -1602, -1326, -9045, -758, -466, -167, 137, 447, 764, 1087, 864, 361, -5923, 15419, 15722, 16031, 16346, 16668, 16995, 17328, 17668, 18013, 18365],
      patrimoine: [-86, 8612, 16894, 25773, 35268, 45396, 56174, 67620, 79753, 84594, 98161, 112475, 127558, 143432, 160118, 177642, 196026, 214743, 233532, 246631, 281688, 303353, 325447, 347977, 370953, 394384, 418281, 442656, 467520, 492884],
      capital_restant: [198900, 192055, 184952, 177582, 169935, 162000, 153766, 145223, 136358, 127159, 117614, 107710, 97433, 86769, 75704, 64223, 52309, 39948, 27120, 13811, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [1214, -506, -821, -529, -232, 71, 380, 695, 1017, -6655, 1680, 2021, 2369, 1755, 1769, 2018, 2271, 2528, 2789, -3446, 17945, 18298, 18659, 19027, 19402, 19785, 20175, 20573, 20978, 21391],
      patrimoine: [2314, 12652, 23014, 34017, 45677, 58012, 71042, 84786, 99263, 106493, 122498, 139299, 156919, 174410, 192418, 211195, 230763, 251144, 272360, 287937, 325519, 349762, 374483, 399695, 425405, 451625, 478361, 505624, 533421, 561762],
      capital_restant: [198900, 192055, 184952, 177582, 169935, 162000, 153766, 145223, 136358, 127159, 117614, 107710, 97433, 86769, 75704, 64223, 52309, 39948, 27120, 13811, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [3614, 1134, 1260, 1593, 1933, 2279, 2632, 2993, 2866, -4265, 3257, 3157, 3438, 3722, 4012, 4306, 4605, 4908, 5217, -970, 20471, 20875, 21287, 21708, 22137, 22574, 23019, 23472, 23933, 24403],
      patrimoine: [4714, 16692, 29135, 42260, 56085, 70628, 85911, 101952, 118278, 127898, 145481, 163418, 182106, 201565, 221817, 242882, 264783, 287545, 311189, 329242, 369351, 396170, 423520, 451412, 479856, 508864, 538447, 568618, 599388, 630769],
      capital_restant: [198900, 192055, 184952, 177582, 169935, 162000, 153766, 145223, 136358, 127159, 117614, 107710, 97433, 86769, 75704, 64223, 52309, 39948, 27120, 13811, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "300": {
    patrimoniale: {
      cashflow: [-1217, -2857, -3890, -3515, -3133, -2744, -2346, -1941, -1527, -9105, -675, -236, 211, 668, 1134, 1609, 941, 608, 928, -5247, 23453, 23908, 24371, 24845, 25327, 25819, 26320, 26831, 27352, 27883],
      patrimoine: [4885, 20726, 36701, 53635, 71555, 90487, 110459, 131500, 153640, 168909, 193338, 218959, 244233, 270463, 297813, 326316, 356003, 386908, 419065, 446010, 502650, 539338, 576746, 614887, 653777, 693433, 733870, 775103, 817148, 860020],
      capital_restant: [297498, 287260, 276637, 265613, 254175, 242306, 229991, 217212, 203952, 190194, 175917, 161103, 145732, 129782, 113232, 96059, 78240, 59750, 40565, 20657, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [2383, -397, -769, -332, 114, 569, 1032, 1505, 1988, -5520, 2982, 3494, 2442, 2670, 3039, 3413, 3793, 4178, 4570, -1532, 27242, 27773, 28314, 28866, 29429, 30003, 30587, 31183, 31790, 32408],
      patrimoine: [8485, 26786, 45882, 66000, 87167, 109411, 132762, 157249, 181302, 199891, 226046, 253295, 281668, 311196, 341912, 373846, 407034, 441510, 477309, 507968, 568397, 608951, 650301, 692463, 735455, 779293, 823993, 869572, 916048, 963438],
      capital_restant: [297498, 287260, 276637, 265613, 254175, 242306, 229991, 217212, 203952, 190194, 175917, 161103, 145732, 129782, 113232, 96059, 78240, 59750, 40565, 20657, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [5983, 2063, 2353, 2852, 3361, 3881, 4411, 4951, 3901, -2200, 4707, 5121, 5542, 5969, 6403, 6845, 7293, 7749, 8212, 2182, 31031, 31638, 32256, 32887, 33530, 34185, 34853, 35534, 36228, 36935],
      patrimoine: [12252, 36876, 62625, 89736, 118245, 148190, 179609, 212022, 244322, 268255, 303357, 339917, 377975, 417573, 458752, 501556, 546030, 592220, 640173, 680190, 760939, 815227, 870577, 927010, 984549, 1043213, 1103018, 1163986, 1226138, 1289497],
      capital_restant: [297498, 287260, 276637, 265613, 254175, 242306, 229991, 217212, 203952, 190194, 175917, 161103, 145732, 129782, 113232, 96059, 78240, 59750, 40565, 20657, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "400": {
    patrimoniale: {
      cashflow: [-1279, -4279, -5867, -5242, -4606, -3956, -3294, -2618, -1929, -13226, -509, 223, 969, 1730, 2506, 2262, 1002, 1528, 2062, -7146, 39522, 40279, 41052, 41841, 42645, 43466, 44303, 45157, 46027, 46914],
      patrimoine: [7452, 28796, 50384, 73250, 97429, 122957, 149871, 178210, 208013, 227320, 260173, 294316, 328062, 363262, 399954, 438182, 477989, 519418, 562516, 597579, 673276, 722410, 772504, 823576, 875646, 928733, 982858, 1038039, 1094298, 1151655],
      capital_restant: [396100, 382468, 368324, 353647, 338418, 322615, 306218, 289204, 271550, 253231, 234222, 214499, 194033, 172797, 150761, 127897, 104172, 79554, 54009, 27503, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [3552, -288, -717, -134, 460, 1066, 1685, 2315, 2959, -8385, 4284, 4667, 3333, 3817, 4309, 4808, 5314, 5829, 6351, -2869, 36540, 37247, 37968, 38704, 39455, 40221, 41002, 41799, 42611, 43440],
      patrimoine: [12252, 36876, 62625, 89736, 118245, 148190, 179609, 212022, 244322, 268255, 303357, 339917, 377975, 417573, 458752, 501556, 546030, 592220, 640173, 680190, 760939, 815227, 870577, 927010, 984549, 1043213, 1103018, 1163986, 1226138, 1289497],
      capital_restant: [396100, 382468, 368324, 353647, 338418, 322615, 306218, 289204, 271550, 253231, 234222, 214499, 194033, 172797, 150761, 127897, 104172, 79554, 54009, 27503, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [8352, 2992, 3445, 4111, 4790, 5483, 6189, 6390, 5456, -3760, 6533, 7085, 7646, 8216, 8795, 9384, 9982, 10590, 11207, 2085, 41592, 42400, 43225, 44066, 44923, 45797, 46688, 47596, 48522, 49466],
      patrimoine: [16652, 51476, 87750, 125735, 165487, 207065, 250532, 295952, 343389, 379851, 437255, 496539, 557769, 621010, 686331, 753799, 823484, 895458, 969793, 1034773, 1157939, 1233227, 1310577, 1390010, 1471549, 1555213, 1641018, 1728986, 1819138, 1911497],
      capital_restant: [396100, 382468, 368324, 353647, 338418, 322615, 306218, 289204, 271550, 253231, 234222, 214499, 194033, 172797, 150761, 127897, 104172, 79554, 54009, 27503, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "500": {
    patrimoniale: {
      cashflow: [-1279, -4279, -5867, -5242, -4606, -3956, -3294, -2618, -1929, -13226, -509, 223, 969, 1730, 2506, 2262, 1002, 1528, 2062, -7146, 39522, 40279, 41052, 41841, 42645, 43466, 44303, 45157, 46027, 46914],
      patrimoine: [10021, 36867, 64068, 92866, 123305, 155429, 189286, 224922, 262388, 289733, 331010, 372790, 415143, 459312, 505348, 553301, 603227, 655180, 709218, 755650, 850404, 911985, 974764, 1038767, 1104017, 1170539, 1238357, 1307497, 1377982, 1449837],
      capital_restant: [494700, 477675, 460010, 441679, 422659, 402923, 382444, 361195, 339146, 316267, 292527, 267893, 242333, 215810, 188290, 159734, 130103, 99357, 67453, 34350, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [4721, -179, -665, 64, 806, 1564, 2337, 3125, 3929, -7250, 5586, 4956, 4359, 4964, 5579, 6203, 6836, 7479, 8132, -955, 45837, 46721, 47623, 48543, 49481, 50437, 51411, 52404, 53416, 54448],
      patrimoine: [16021, 46967, 79370, 113474, 149325, 186970, 226457, 266797, 307345, 339870, 383919, 429791, 477535, 527202, 578845, 632518, 688278, 746182, 806290, 858913, 959910, 1027739, 1096775, 1167042, 1238564, 1311366, 1385473, 1460909, 1537699, 1615868],
      capital_restant: [494700, 477675, 460010, 441679, 422659, 402923, 382444, 361195, 339146, 316267, 292527, 267893, 242333, 215810, 188290, 159734, 130103, 99357, 67453, 34350, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [10721, 3921, 4537, 5370, 6219, 7085, 7968, 7828, 7012, -2070, 8358, 9048, 9749, 10462, 11186, 11922, 12670, 13430, 14202, 5237, 52078, 52970, 53879, 54807, 55753, 56718, 57702, 58706, 59730, 60775],
      patrimoine: [22421, 59367, 98370, 139695, 183405, 229566, 278245, 329509, 383426, 426370, 486119, 548791, 614453, 683173, 755021, 830067, 908383, 990041, 1075115, 1151913, 1285910, 1377739, 1471775, 1568042, 1666564, 1767366, 1870473, 1975909, 2083699, 2193868],
      capital_restant: [494700, 477675, 460010, 441679, 422659, 402923, 382444, 361195, 339146, 316267, 292527, 267893, 242333, 215810, 188290, 159734, 130103, 99357, 67453, 34350, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "700": {
    patrimoniale: {
      cashflow: [-1340, -5700, -7844, -6970, -6078, -5169, -4241, -3296, -2331, -17346, -343, 681, 1726, 2791, 3878, 2266, 1711, 2449, 3197, -9045, 55590, 56651, 57718, 58692, 59686, 60694, 61722, 62770, 63838, 64927],
      patrimoine: [15160, 53011, 91438, 132099, 175057, 220374, 268115, 318347, 371138, 410559, 468685, 526487, 586056, 648164, 712884, 780289, 850453, 923454, 999124, 1065042, 1197108, 1282632, 1369687, 1458301, 1548508, 1640341, 1733833, 1829016, 1925925, 2024591],
      capital_restant: [691900, 668089, 643381, 617744, 591142, 563538, 534896, 505176, 474338, 442339, 409135, 374682, 338933, 301838, 263347, 223408, 181965, 138963, 94342, 48042, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [7060, 40, -561, 459, 1499, 2560, 3642, 4745, 5871, -8981, 8190, 6284, 6411, 7258, 8119, 8992, 9879, 10780, 11445, -377, 63629, 64721, 65835, 66971, 68130, 69312, 70518, 71748, 73002, 74281],
      patrimoine: [23560, 67151, 112860, 160951, 211486, 264531, 320155, 376345, 433389, 479851, 541795, 606289, 673403, 743209, 815776, 890886, 968610, 1049019, 1132186, 1206773, 1346640, 1440121, 1535292, 1632185, 1730836, 1831277, 1933543, 2037668, 2143686, 2251634],
      capital_restant: [691900, 668089, 643381, 617744, 591142, 563538, 534896, 505176, 474338, 442339, 409135, 374682, 338933, 301838, 263347, 223408, 181965, 138963, 94342, 48042, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [15460, 5780, 6722, 7887, 9076, 10288, 11525, 10703, 10124, -1941, 12009, 12975, 13957, 14955, 15966, 16698, 17439, 18187, 18944, 8291, 71430, 72678, 73951, 75250, 76574, 77924, 79301, 80705, 82136, 83595],
      patrimoine: [23560, 67151, 112860, 160951, 211486, 264531, 320155, 376345, 433389, 479851, 541795, 606289, 673403, 743209, 815776, 890886, 968610, 1049019, 1132186, 1206773, 1346640, 1440121, 1535292, 1632185, 1730836, 1831277, 1933543, 2037668, 2143686, 2251634],
      capital_restant: [691900, 668089, 643381, 617744, 591142, 563538, 534896, 505176, 474338, 442339, 409135, 374682, 338933, 301838, 263347, 223408, 181965, 138963, 94342, 48042, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "1000": {
    patrimoniale: {
      cashflow: [-1433, -7833, -10809, -9560, -8287, -6988, -5663, -4312, -2933, -17527, -93, 1370, 2862, 4384, 5346, 1737, 2776, 3445, 4106, -7018, 78168, 79505, 80869, 82260, 83680, 85128, 86605, 88112, 89648, 91215],
      patrimoine: [10867, 57026, 101887, 149733, 200645, 254710, 312016, 372654, 436717, 488302, 559509, 634441, 713203, 795906, 882070, 967211, 1056064, 1148351, 1244159, 1331800, 1507685, 1616909, 1728091, 1841271, 1956489, 2073786, 2193204, 2314785, 2438571, 2564606],
      capital_restant: [987700, 953709, 918438, 881841, 843866, 804461, 763574, 721148, 677126, 631447, 584048, 534866, 483833, 430879, 375933, 318918, 259758, 198372, 134675, 68581, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [10567, 367, -405, 1052, 2538, 4053, 5599, 7175, 8783, -1576, 10200, 8298, 9489, 10536, 11377, 12226, 13083, 13947, 14818, 7445, 89312, 90872, 92464, 94087, 95743, 97431, 99152, 100907, 102696, 104520],
      patrimoine: [22867, 77226, 132491, 190949, 252686, 317792, 386359, 458483, 534263, 601799, 683300, 765159, 850549, 939403, 1031599, 1127229, 1226389, 1329178, 1435697, 1537802, 1724831, 1845423, 1968200, 2093207, 2220488, 2350085, 2482043, 2616408, 2753226, 2892544],
      capital_restant: [987700, 953709, 918438, 881841, 843866, 804461, 763574, 721148, 677126, 631447, 584048, 534866, 483833, 430879, 375933, 318918, 259758, 198372, 134675, 68581, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [22567, 8567, 9999, 11664, 13362, 15094, 16860, 15017, 14793, 3128, 17202, 18202, 19214, 20238, 21273, 22320, 23379, 24448, 25529, 15622, 100457, 102240, 104059, 105914, 107806, 109736, 111705, 113713, 115761, 117850],
      patrimoine: [34867, 97426, 163095, 232165, 304726, 380873, 460702, 540667, 622456, 694697, 783200, 874964, 970079, 1068635, 1170727, 1276452, 1385908, 1499198, 1616429, 1726710, 1924884, 2056843, 2191215, 2328048, 2467393, 2609300, 2753818, 2901000, 3050898, 3203569],
      capital_restant: [987700, 953709, 918438, 881841, 843866, 804461, 763574, 721148, 677126, 631447, 584048, 534866, 483833, 430879, 375933, 318918, 259758, 198372, 134675, 68581, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  },
  "1200": {
    patrimoniale: {
      cashflow: [-1494, -9254, -12786, -11287, -9759, -8201, -6611, -4989, -3335, -17648, 73, 1829, 3619, 5445, 5470, 1843, 2628, 3418, 4212, -5992, 93061, 94666, 96303, 97973, 99676, 101413, 103184, 104989, 106829, 108705],
      patrimoine: [13606, 69129, 123136, 180723, 241990, 307039, 375977, 448912, 525958, 591229, 676846, 766933, 861615, 961024, 1063458, 1165366, 1271267, 1381274, 1495506, 1603082, 1813380, 1943709, 2076388, 2211464, 2348985, 2488999, 2631553, 2776694, 2924470, 3074930],
      capital_restant: [1184900, 1144122, 1101810, 1057905, 1012348, 965077, 916026, 865130, 812318, 757518, 700657, 641655, 580433, 516907, 450990, 382592, 311621, 237978, 161564, 82274, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    mixte: {
      cashflow: [12906, 586, -301, 1447, 3230, 5048, 6903, 8795, 10725, -3307, 12319, 9936, 10926, 11927, 12936, 13955, 14984, 16020, 17066, 7119, 106435, 108307, 110217, 112165, 114152, 116178, 118244, 120351, 122499, 124689],
      patrimoine: [28006, 93369, 159861, 230182, 304438, 382736, 465188, 551908, 643013, 722626, 820488, 918682, 1020671, 1126562, 1236462, 1350482, 1468738, 1591348, 1718434, 1839121, 2062793, 2206763, 2353355, 2502624, 2654621, 2809400, 2967015, 3127521, 3290975, 3457434],
      capital_restant: [1184900, 1144122, 1101810, 1057905, 1012348, 965077, 916026, 865130, 812318, 757518, 700657, 641655, 580433, 516907, 450990, 382592, 311621, 237978, 161564, 82274, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    agressive: {
      cashflow: [27306, 10426, 12184, 14182, 16219, 18297, 20417, 17892, 17568, 6508, 19926, 21126, 22341, 23569, 24812, 26068, 27339, 28623, 29920, 20231, 119808, 121948, 124131, 126357, 128627, 130942, 133302, 135709, 138163, 140665],
      patrimoine: [42406, 117609, 196585, 279641, 366886, 458434, 554399, 650216, 748164, 837591, 943061, 1052445, 1165849, 1283382, 1405157, 1531290, 1661902, 1797114, 1937053, 2070852, 2307897, 2465508, 2626015, 2789475, 2955948, 3125491, 3298160, 3474018, 3653126, 3835548],
      capital_restant: [1184900, 1144122, 1101810, 1057905, 1012348, 965077, 916026, 865130, 812318, 757518, 700657, 641655, 580433, 516907, 450990, 382592, 311621, 237978, 161564, 82274, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  }
};

const apportData = {
  "200": 35100,
  "300": 52500,
  "400": 69900,
  "500": 87300,
  "700": 122100,
  "1000": 174300,
  "1200": 209100
};

export default function Vision() {
  const [typeStrategie, setTypeStrategie] = useState("mixte");
  const [projets, setProjets] = useState([{ taille: "300" }, { taille: "400" }, { taille: "500" }]);
  const [frequence, setFrequence] = useState(2);
  const [objectif, setObjectif] = useState("patrimoine");
  const [age, setAge] = useState("35");
  const [typeInvestissement, setTypeInvestissement] = useState("seule");
  const [resultat, setResultat] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [revenusMensuels, setRevenusMensuels] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);
  const resultsContainerRef = useRef(null);

  const calculerStrategie = () => {
    try {
      setHasError(false);
      setIsLoading(true);
      
      setTimeout(() => {
        const strategieKey = typeStrategie === "patrimoniale" ? "patrimoniale" :
        typeStrategie === "agressive" ? "agressive" : "mixte";

        // Initialiser les tableaux cumulés sur 30 ans
        const cashflowCumule = new Array(30).fill(0);
        const patrimoineCumule = new Array(30).fill(0);
        const capitalRestantCumule = new Array(30).fill(0);
        const apportTotal = projets.reduce((sum, p) => sum + apportData[p.taille], 0);

        // Stocker les détails par projet pour chaque année
        const detailsProjetsParAnnee = new Array(30).fill(null).map(() => []);

        // Superposer chaque projet
        projets.forEach((projet, index) => {
          const anneeDebut = index * frequence;
          const tailleProjet = projet.taille;
          const donneesProjet = strategiesData[tailleProjet][strategieKey];

          // Ajouter les données du projet à partir de son année de début
          donneesProjet.cashflow.forEach((cf, yearIndex) => {
            const anneeGlobale = anneeDebut + yearIndex;
            if (anneeGlobale < 30) {
              cashflowCumule[anneeGlobale] += cf;

              // Stocker les détails pour cette année
              detailsProjetsParAnnee[anneeGlobale].push({
                projetIndex: index + 1,
                taille: tailleProjet,
                cashflow: cf,
                patrimoine: donneesProjet.patrimoine[yearIndex],
                capitalRestant: donneesProjet.capital_restant[yearIndex]
              });
            }
          });

          donneesProjet.patrimoine.forEach((pat, yearIndex) => {
            const anneeGlobale = anneeDebut + yearIndex;
            if (anneeGlobale < 30) {
              patrimoineCumule[anneeGlobale] += pat;
            }
          });

          donneesProjet.capital_restant.forEach((cap, yearIndex) => {
            const anneeGlobale = anneeDebut + yearIndex;
            if (anneeGlobale < 30) {
              capitalRestantCumule[anneeGlobale] += cap;
            }
          });
        });

        // Préparer les données pour le graphique
        const chartData = [];
        for (let i = 0; i < 30; i++) {
          chartData.push({
            annee: i + 1,
            patrimoine: Math.round(patrimoineCumule[i]),
            cashflow: Math.round(cashflowCumule[i]),
            capitalRestant: Math.round(capitalRestantCumule[i]),
            detailsProjets: detailsProjetsParAnnee[i]
          });
        }

        setResultat({
          chartData,
          patrimoine20: patrimoineCumule[19],
          patrimoine25: patrimoineCumule[24],
          patrimoine30: patrimoineCumule[29],
          cashflow20: cashflowCumule[19],
          cashflow25: cashflowCumule[24],
          cashflow30: cashflowCumule[29],
          apportTotal
        });

        setIsLoading(false);
        setTimeout(() => {
          if (resultsContainerRef.current) {
            window.scrollTo({ top: resultsContainerRef.current.offsetTop - 100, behavior: 'smooth' });
          }
        }, 100);
      }, 800);
    } catch (error) {
      console.error("Erreur lors du calcul de la stratégie:", error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  const ajouterProjet = () => {
    setProjets([...projets, { taille: "200" }]);
  };

  const supprimerProjet = (index) => {
    const nouveauxProjets = projets.filter((_, i) => i !== index);
    setProjets(nouveauxProjets);
  };

  const modifierTailleProjet = (index, nouvelleTaille) => {
    const nouveauxProjets = [...projets];
    nouveauxProjets[index].taille = nouvelleTaille;
    setProjets(nouveauxProjets);
  };

  const dupliquerProjet = (index) => {
    const projetADupliquer = projets[index];
    const nouveauxProjets = [...projets];
    nouveauxProjets.splice(index + 1, 0, { ...projetADupliquer });
    setProjets(nouveauxProjets);
  };

  if (hasError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-encre">
        <div className="text-center">
          <p className="m-0 text-[20px]">Le calcul n'a pas abouti.</p>
          <button type="button" onClick={() => setHasError(false)}
            className="mt-4 rounded-full bg-menthe px-5 py-2.5 text-[14px] font-medium text-fond hover:bg-menthe-survol">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-encre">
      <AnimatePresence>
        {isLoading &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-fond/95 backdrop-blur-3xl">
            <div className="flex flex-col items-center gap-5">
              <span className="select-none text-[15px] tracking-[0.36em] text-encre">KLOCKA</span>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-menthe/30 border-t-menthe" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-ardoise">Calcul de votre projection</span>
            </div>
        </motion.div>
        }
      </AnimatePresence>

      <div className="mx-auto max-w-[1100px] px-5 py-6 md:px-8">
        <AnimatePresence mode="wait">
          {resultat ?
          <div ref={resultsContainerRef} key="resultats">
            <ResultatsVision
              resultat={resultat} projets={projets} frequence={frequence}
              typeStrategie={typeStrategie} apportData={apportData}
              vue={currentSlide} setVue={setCurrentSlide}
              revenusMensuels={revenusMensuels} setRevenusMensuels={setRevenusMensuels}
              onModifier={() => { setResultat(null); setCurrentStep(4); setCurrentSlide(0); }}
              onRecommencer={() => { setResultat(null); setCurrentStep(1); setCurrentSlide(0); }} />
          </div> :
          <AccueilVision
            key="accueil"
            etape={currentStep} setEtape={setCurrentStep}
            age={age} setAge={setAge}
            typeInvestissement={typeInvestissement} setTypeInvestissement={setTypeInvestissement}
            objectif={objectif} setObjectif={setObjectif}
            typeStrategie={typeStrategie} setTypeStrategie={setTypeStrategie}
            frequence={frequence} setFrequence={setFrequence}
            projets={projets}
            ajouterProjet={ajouterProjet} supprimerProjet={supprimerProjet}
            dupliquerProjet={dupliquerProjet} modifierTailleProjet={modifierTailleProjet}
            onCalculer={calculerStrategie} />
          }
        </AnimatePresence>
      </div>
    </div>
  );
}
